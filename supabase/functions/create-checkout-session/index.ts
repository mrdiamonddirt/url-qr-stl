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

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function requireSecretKey(name: string): string {
  const value = requireEnv(name);
  if (value.startsWith("pk_")) {
    throw new Error(`${name} is set to a publishable key. Replace it with an sk_ secret key in Supabase secrets.`);
  }
  return value;
}

async function getOrCreateStripeCustomer(
  stripe: Stripe,
  supabase: ReturnType<typeof createClient>,
  userId: string,
  email: string | undefined,
  customerId: string | undefined,
): Promise<string> {
  if (customerId) {
    try {
      const existingCustomer = await stripe.customers.retrieve(customerId);
      if (!("deleted" in existingCustomer) || !existingCustomer.deleted) {
        return customerId;
      }
    } catch (error) {
      const stripeError = error as { code?: string; message?: string };
      if (stripeError.code !== "resource_missing" && !/No such customer/i.test(stripeError.message ?? "")) {
        throw error;
      }
      console.warn("[create-checkout-session] Stored Stripe customer is missing, recreating:", customerId);
    }
  }

  const newCustomer = await stripe.customers.create({ email });
  await supabase
    .from("profiles")
    .update({ stripe_customer_id: newCustomer.id })
    .eq("id", userId);

  return newCustomer.id;
}

function normalizeBasePath(basePath: string | undefined): string {
  if (!basePath || basePath === "/") {
    return "";
  }
  const withLeadingSlash = basePath.startsWith("/") ? basePath : `/${basePath}`;
  return withLeadingSlash.endsWith("/") ? withLeadingSlash.slice(0, -1) : withLeadingSlash;
}

Deno.serve(async (req) => {
  try {
    if (req.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const supabase = createClient(
      requireEnv("SUPABASE_URL"),
      requireEnv("SUPABASE_ANON_KEY"),
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const stripe = new Stripe(requireSecretKey("STRIPE_SECRET_KEY"), {
      apiVersion: "2024-04-10",
    });

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("stripe_customer_id, plan")
      .eq("id", user.id)
      .single();

    if (profileError) {
      console.error("[create-checkout-session] Failed to load profile:", profileError);
    }

    const sourcePlan = normalizeSourcePlan(profile?.plan);
    const customerId = await getOrCreateStripeCustomer(
      stripe,
      supabase,
      user.id,
      user.email ?? undefined,
      profile?.stripe_customer_id as string | undefined,
    );

    const { origin, targetPlan, basePath } = await req.json() as {
      origin: string;
      targetPlan?: CheckoutTargetPlan;
      basePath?: string;
    };
    const appBaseUrl = `${origin}${normalizeBasePath(basePath)}`;

    const requestedPlan: CheckoutTargetPlan = targetPlan ?? "premium_monthly";
    if (!PRICE_IDS[requestedPlan]) {
      return jsonResponse({ error: `Missing Stripe price for ${requestedPlan}.` }, 500);
    }

    const allowedTargets = getAllowedUpgradeTargets(sourcePlan);
    if (!allowedTargets.includes(requestedPlan)) {
      return jsonResponse({ error: "Selected plan is not a valid upgrade target." }, 400);
    }

    const upgradeCreditCents = getFixedUpgradeCreditCents(sourcePlan, requestedPlan);
    let discountCouponId: string | undefined;

    if (upgradeCreditCents > 0) {
      // Create a short plan identifier for the coupon name (Stripe enforces 40 char max)
      const planAbbrev = (plan: string) => {
        if (plan === "premium_monthly") return "pm";
        if (plan === "premium_yearly") return "py";
        if (plan === "lifetime") return "lt";
        return plan.substring(0, 2);
      };
      const coupon = await stripe.coupons.create({
        amount_off: upgradeCreditCents,
        currency: "gbp",
        duration: "once",
        name: `UC-${planAbbrev(sourcePlan)}-${planAbbrev(requestedPlan)}`,
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

    return jsonResponse({ url: session.url });
  } catch (error) {
    console.error("[create-checkout-session] Unhandled error:", error);
    return jsonResponse(
      {
        error: error instanceof Error ? error.message : "Failed to create checkout session.",
      },
      500,
    );
  }
});
