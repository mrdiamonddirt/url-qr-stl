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

  async function resolveUserIdFromCustomer(customerId: string | null | undefined): Promise<string | null> {
    if (!customerId) return null;
    const { data, error } = await supabase
      .from("profiles")
      .select("id")
      .eq("stripe_customer_id", customerId)
      .maybeSingle();

    if (error) {
      console.error("[stripe-webhook] Failed to resolve user by customer id", customerId, error);
      return null;
    }

    return data?.id ?? null;
  }

  async function updateProfileToPremiumByUserId(
    userId: string,
    customerId: string | null,
    subscriptionId: string,
    periodEndUnix: number,
  ) {
    const payload = {
      plan: "premium",
      stripe_customer_id: customerId,
      stripe_subscription_id: subscriptionId,
      subscription_ends_at: new Date(periodEndUnix * 1000).toISOString(),
    };

    const { data, error } = await supabase
      .from("profiles")
      .update(payload)
      .eq("id", userId)
      .select("id");

    if (error) {
      console.error("[stripe-webhook] Failed to update profile for userId", userId, error);
      return;
    }

    if (!data?.length) {
      console.error("[stripe-webhook] No profile row updated for userId", userId);
      return;
    }

    console.log("[stripe-webhook] Profile upgraded for userId", userId);
  }

  async function updatePlanBySubscriptionOrCustomer(
    subscriptionId: string,
    customerId: string | null,
    values: Record<string, string | null>,
  ) {
    const bySubscription = await supabase
      .from("profiles")
      .update(values)
      .eq("stripe_subscription_id", subscriptionId)
      .select("id");

    if (bySubscription.error) {
      console.error("[stripe-webhook] Failed to update by subscription", subscriptionId, bySubscription.error);
      return;
    }

    if ((bySubscription.data?.length ?? 0) > 0) {
      return;
    }

    if (!customerId) {
      console.warn("[stripe-webhook] No matching profile by subscription and no customer id fallback", subscriptionId);
      return;
    }

    const byCustomer = await supabase
      .from("profiles")
      .update(values)
      .eq("stripe_customer_id", customerId)
      .select("id");

    if (byCustomer.error) {
      console.error("[stripe-webhook] Failed to update by customer", customerId, byCustomer.error);
      return;
    }

    if ((byCustomer.data?.length ?? 0) === 0) {
      console.warn("[stripe-webhook] No profile updated by subscription or customer", {
        subscriptionId,
        customerId,
      });
    }
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    if (session.mode === "subscription") {
      const subscriptionId = session.subscription as string;
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      const customerId = (session.customer as string | null) ?? null;
      const metadataUserId = (subscription.metadata?.supabase_user_id as string | undefined)
        ?? (session.metadata?.supabase_user_id as string | undefined)
        ?? (session.client_reference_id as string | undefined);
      const userId = metadataUserId ?? await resolveUserIdFromCustomer(customerId);

      console.log("[stripe-webhook] checkout.session.completed:", {
        subscriptionId,
        subscription_metadata: subscription.metadata,
        session_metadata: session.metadata,
        userId,
        session_customer: customerId,
      });

      if (userId) {
        await updateProfileToPremiumByUserId(
          userId,
          customerId,
          subscriptionId,
          subscription.current_period_end,
        );
      } else {
        console.error(
          "[stripe-webhook] checkout.session.completed: no resolvable user id",
          subscriptionId,
        );
      }
    }
  }

  if (event.type === "customer.subscription.deleted") {
    const subscription = event.data.object as Stripe.Subscription;
    await updatePlanBySubscriptionOrCustomer(subscription.id, subscription.customer as string | null, {
      plan: "free",
      stripe_subscription_id: null,
      subscription_ends_at: null,
    });
  }

  if (event.type === "customer.subscription.updated") {
    const subscription = event.data.object as Stripe.Subscription;
    const isActive = subscription.status === "active" || subscription.status === "trialing";
    await updatePlanBySubscriptionOrCustomer(subscription.id, subscription.customer as string | null, {
      plan: isActive ? "premium" : "free",
      stripe_subscription_id: subscription.id,
      subscription_ends_at: new Date(subscription.current_period_end * 1000).toISOString(),
    });
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { "Content-Type": "application/json" },
  });
});
