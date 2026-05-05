// Supabase Edge Function: stripe-webhook
// Deploy: supabase functions deploy stripe-webhook
//
// Required secrets:
//   STRIPE_WEBHOOK_SECRET  - whsec_... from Stripe dashboard
//   STRIPE_SECRET_KEY      - sk_live_... or sk_test_...
//
// Register this endpoint in Stripe Dashboard → Webhooks:
//   https://<project-ref>.supabase.co/functions/v1/stripe-webhook
// Events to listen for:
//   checkout.session.completed
//   customer.subscription.deleted
//   customer.subscription.updated

import Stripe from "https://esm.sh/stripe@14?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "stripe-signature, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
    apiVersion: "2024-04-10",
  });

  const body = await req.text();
  const signature = req.headers.get("stripe-signature")!;

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      body,
      signature,
      Deno.env.get("STRIPE_WEBHOOK_SECRET")!,
    );
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return new Response("Bad signature", { status: 400 });
  }

  // Use service role key to update profiles
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    if (session.mode === "subscription") {
      const subscriptionId = session.subscription as string;
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      const userId = subscription.metadata?.supabase_user_id as string | undefined;
      console.log("[stripe-webhook] checkout.session.completed:", {
        subscriptionId,
        subscription_metadata: subscription.metadata,
        userId,
        session_customer: session.customer,
      });
      if (userId) {
        const { error, status, data } = await supabase.from("profiles").update({
          plan: "premium",
          stripe_customer_id: session.customer as string,
          stripe_subscription_id: subscriptionId,
          subscription_ends_at: new Date(subscription.current_period_end * 1000).toISOString(),
        }).eq("id", userId);
        if (error) {
          console.error("[stripe-webhook] Failed to update profile for userId", userId, error);
        } else {
          console.log("[stripe-webhook] Profile updated for userId", userId, { status, data });
        }
      } else {
        console.error("[stripe-webhook] checkout.session.completed: no supabase_user_id in subscription metadata", subscriptionId, subscription.metadata);
      }
    }
  }

  if (event.type === "customer.subscription.deleted") {
    const subscription = event.data.object as Stripe.Subscription;
    await supabase.from("profiles").update({
      plan: "free",
      stripe_subscription_id: null,
      subscription_ends_at: null,
    }).eq("stripe_subscription_id", subscription.id);
  }

  if (event.type === "customer.subscription.updated") {
    const subscription = event.data.object as Stripe.Subscription;
    const isActive = subscription.status === "active" || subscription.status === "trialing";
    await supabase.from("profiles").update({
      plan: isActive ? "premium" : "free",
      subscription_ends_at: new Date(subscription.current_period_end * 1000).toISOString(),
    }).eq("stripe_subscription_id", subscription.id);
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { "Content-Type": "application/json" },
  });
});
