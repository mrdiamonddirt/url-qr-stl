// Supabase Edge Function: create-checkout-session
// Deploy: supabase functions deploy create-checkout-session
//
// Required secrets (set via `supabase secrets set`):
//   STRIPE_SECRET_KEY         - sk_live_... or sk_test_...
//   STRIPE_PRICE_ID_MONTHLY   - price_... for the monthly plan
//   STRIPE_PRICE_ID_YEARLY    - price_... for the yearly plan
//   STRIPE_PRICE_ID_LIFETIME  - price_... for the lifetime plan

import Stripe from "https://esm.sh/stripe@14?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2?target=deno";

type ProfilePlan = "free" | "premium" | "premium_monthly" | "premium_yearly" | "lifetime";
type CheckoutTargetPlan = "premium_monthly" | "premium_yearly" | "lifetime";

const PRICE_IDS: Record<CheckoutTargetPlan, string> = {
  premium_monthly: Deno.env.get("STRIPE_PRICE_ID_MONTHLY") ?? "",
  premium_yearly: Deno.env.get("STRIPE_PRICE_ID_YEARLY") ?? "",
  lifetime: Deno.env.get("STRIPE_PRICE_ID_LIFETIME") ?? "",
};

const PLAN_BILLING_MODE: Record<CheckoutTargetPlan, "subscription" | "payment"> = {
  premium_monthly: "subscription",
  premium_yearly: "subscription",
  lifetime: "payment",
};

function normalizeSourcePlan(plan: string | null | undefined): ProfilePlan {
  if (plan === "premium_monthly" || plan === "premium_yearly" || plan === "lifetime" || plan === "premium") {
    return plan;
  }
  return "free";
}

function getFixedUpgradeCreditCents(sourcePlan: ProfilePlan, targetPlan: CheckoutTargetPlan): number {
  const normalizedSource = sourcePlan === "premium" ? "premium_monthly" : sourcePlan;
  if (normalizedSource === "premium_monthly" && (targetPlan === "premium_yearly" || targetPlan === "lifetime")) {
    return 399;
  }
  if (normalizedSource === "premium_yearly" && targetPlan === "lifetime") {
    return 3999;
  }
  return 0;
}

function getAllowedUpgradeTargets(sourcePlan: ProfilePlan): CheckoutTargetPlan[] {
  if (sourcePlan === "free") return ["premium_monthly", "premium_yearly", "lifetime"];
  if (sourcePlan === "premium" || sourcePlan === "premium_monthly") return ["premium_yearly", "lifetime"];
  if (sourcePlan === "premium_yearly") return ["lifetime"];
  return [];
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function normalizeBasePath(basePath: string | undefined): string {
  if (!basePath || basePath === "/") {
    return "";
  }
  const withLeadingSlash = basePath.startsWith("/") ? basePath : `/${basePath}`;
  return withLeadingSlash.endsWith("/") ? withLeadingSlash.slice(0, -1) : withLeadingSlash;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response("Unauthorized", { status: 401, headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    return new Response("Unauthorized", { status: 401, headers: corsHeaders });
  }

  const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
    apiVersion: "2024-04-10",
  });

  // Look up or create Stripe customer
  const { data: profile } = await supabase
    .from("profiles")
    .select("stripe_customer_id, plan")
    .eq("id", user.id)
    .single();

  let customerId = profile?.stripe_customer_id as string | undefined;
  const sourcePlan = normalizeSourcePlan(profile?.plan);

  if (!customerId) {
    const customer = await stripe.customers.create({ email: user.email! });
    customerId = customer.id;
    await supabase
      .from("profiles")
      .update({ stripe_customer_id: customerId })
      .eq("id", user.id);
  }

  const { origin, targetPlan, basePath } = await req.json() as {
    origin: string;
    targetPlan?: CheckoutTargetPlan;
    basePath?: string;
  };
  const appBaseUrl = `${origin}${normalizeBasePath(basePath)}`;

  const requestedPlan: CheckoutTargetPlan = targetPlan ?? "premium_monthly";
  if (!PRICE_IDS[requestedPlan]) {
    return new Response(JSON.stringify({ error: `Missing Stripe price for ${requestedPlan}.` }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const allowedTargets = getAllowedUpgradeTargets(sourcePlan);
  if (!allowedTargets.includes(requestedPlan)) {
    return new Response(JSON.stringify({ error: "Selected plan is not a valid upgrade target." }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const upgradeCreditCents = getFixedUpgradeCreditCents(sourcePlan, requestedPlan);
  let discountCouponId: string | undefined;

  if (upgradeCreditCents > 0) {
    const coupon = await stripe.coupons.create({
      amount_off: upgradeCreditCents,
      currency: "gbp",
      duration: "once",
      name: `Upgrade credit ${sourcePlan} -> ${requestedPlan}`,
      metadata: {
        source_plan: sourcePlan,
        target_plan: requestedPlan,
        user_id: user.id,
      },
    });
    discountCouponId = coupon.id;
  }

  const metadata = {
    supabase_user_id: user.id,
    source_plan: sourcePlan,
    target_plan: requestedPlan,
    upgrade_credit_cents: String(upgradeCreditCents),
  };

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    client_reference_id: user.id,
    mode: PLAN_BILLING_MODE[requestedPlan],
    line_items: [{ price: PRICE_IDS[requestedPlan], quantity: 1 }],
    success_url: `${appBaseUrl}/#/editor?upgrade=success`,
    cancel_url: `${appBaseUrl}/#/editor`,
    metadata,
    discounts: discountCouponId ? [{ coupon: discountCouponId }] : undefined,
    subscription_data: PLAN_BILLING_MODE[requestedPlan] === "subscription"
      ? { metadata }
      : undefined,
  });

  return new Response(JSON.stringify({ url: session.url }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
