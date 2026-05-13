// Supabase Edge Function: admin-panel
// Deploy: supabase functions deploy admin-panel
//
// Required secrets:
//   SUPABASE_SERVICE_ROLE_KEY
//   STRIPE_SECRET_KEY
//   STRIPE_PRICE_ID_MONTHLY
//   STRIPE_PRICE_ID_YEARLY

import Stripe from "https://esm.sh/stripe@14?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2?target=deno";

type Plan = "free" | "premium" | "premium_monthly" | "premium_yearly" | "lifetime";
type BillingCycle = "none" | "monthly" | "yearly" | "lifetime";
type DowngradeTiming = "immediate" | "period_end";

type AdminAction =
  | "get_dashboard_metrics"
  | "list_users"
  | "update_user_plan"
  | "set_user_ban";

const OWNER_EMAILS = new Set(["woodrowan@gmail.com"]);

const PRICE_IDS: Record<"premium_monthly" | "premium_yearly", string> = {
  premium_monthly: Deno.env.get("STRIPE_PRICE_ID_MONTHLY") ?? "",
  premium_yearly: Deno.env.get("STRIPE_PRICE_ID_YEARLY") ?? "",
};

const PLAN_BILLING_CYCLE: Record<Plan, BillingCycle> = {
  free: "none",
  premium: "monthly",
  premium_monthly: "monthly",
  premium_yearly: "yearly",
  lifetime: "lifetime",
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function toPlan(value: string | null | undefined): Plan {
  if (value === "premium" || value === "premium_monthly" || value === "premium_yearly" || value === "lifetime") {
    return value;
  }
  return "free";
}

function isPaidPlan(plan: Plan): boolean {
  return plan !== "free";
}

function toBillingCycle(plan: Plan): BillingCycle {
  return PLAN_BILLING_CYCLE[plan];
}

function isOwnerEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return OWNER_EMAILS.has(email.toLowerCase());
}

async function ensureAdmin(
  req: Request,
): Promise<
  | { user: { id: string; email: string }; supabaseAdmin: ReturnType<typeof createClient> }
  | { response: Response }
> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return { response: jsonResponse({ error: "Unauthorized" }, 401) };
  }

  const supabaseUser = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: authData, error: authError } = await supabaseUser.auth.getUser();
  if (authError || !authData.user) {
    return { response: jsonResponse({ error: "Unauthorized" }, 401) };
  }

  if (!isOwnerEmail(authData.user.email)) {
    return { response: jsonResponse({ error: "Forbidden" }, 403) };
  }

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  return {
    user: { id: authData.user.id, email: authData.user.email ?? "" },
    supabaseAdmin,
  };
}

async function getDashboardMetrics(supabaseAdmin: ReturnType<typeof createClient>) {
  const now = Date.now();
  const sevenDaysAgoIso = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
  const thirtyDaysAgoIso = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [
    usersCount,
    tagsCount,
    bannedCount,
    scanEvents7dCount,
    scanEvents30dCount,
    profilesResponse,
    shortUrlsResponse,
  ] = await Promise.all([
    supabaseAdmin.from("profiles").select("id", { count: "exact", head: true }),
    supabaseAdmin.from("short_urls").select("id", { count: "exact", head: true }),
    supabaseAdmin.from("profiles").select("id", { count: "exact", head: true }).eq("is_banned", true),
    supabaseAdmin.from("short_url_scan_events").select("id", { count: "exact", head: true }).gte("scanned_at", sevenDaysAgoIso),
    supabaseAdmin.from("short_url_scan_events").select("id", { count: "exact", head: true }).gte("scanned_at", thirtyDaysAgoIso),
    supabaseAdmin
      .from("profiles")
      .select("id, plan"),
    supabaseAdmin
      .from("short_urls")
      .select("user_id, scan_count"),
  ]);

  if (profilesResponse.error) {
    throw profilesResponse.error;
  }
  if (shortUrlsResponse.error) {
    throw shortUrlsResponse.error;
  }

  const profiles = profilesResponse.data ?? [];
  const shortUrls = shortUrlsResponse.data ?? [];

  const paidUsers = profiles.filter((profile) => isPaidPlan(toPlan(profile.plan))).length;
  const freeUsers = Math.max(0, profiles.length - paidUsers);

  let totalScans = 0;
  const userScanTotals = new Map<string, number>();
  for (const row of shortUrls) {
    const scanCount = Number(row.scan_count ?? 0);
    totalScans += scanCount;
    const userId = row.user_id as string | null;
    if (!userId) continue;
    userScanTotals.set(userId, (userScanTotals.get(userId) ?? 0) + scanCount);
  }

  const topUsersByScans = Array.from(userScanTotals.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([user_id, total_scans]) => ({ user_id, total_scans }));

  const emailByUserId = new Map<string, string>();
  const usersForTop = await Promise.all(
    topUsersByScans.map((entry) => supabaseAdmin.auth.admin.getUserById(entry.user_id)),
  );
  for (const userResult of usersForTop) {
    if (userResult.error || !userResult.data.user?.email) continue;
    emailByUserId.set(userResult.data.user.id, userResult.data.user.email);
  }

  return {
    total_users: usersCount.count ?? 0,
    total_tags: tagsCount.count ?? 0,
    total_scans: totalScans,
    paid_users: paidUsers,
    free_users: freeUsers,
    banned_users: bannedCount.count ?? 0,
    scans_last_7_days: scanEvents7dCount.count ?? 0,
    scans_last_30_days: scanEvents30dCount.count ?? 0,
    top_users_by_scans: topUsersByScans.map((entry) => ({
      ...entry,
      email: emailByUserId.get(entry.user_id) ?? null,
    })),
  };
}

async function listUsers(
  supabaseAdmin: ReturnType<typeof createClient>,
  page: number,
  pageSize: number,
  search: string,
) {
  const { data: listed, error: usersError } = await supabaseAdmin.auth.admin.listUsers({
    page,
    perPage: pageSize,
  });

  if (usersError) {
    throw usersError;
  }

  const users = listed.users ?? [];
  if (!users.length) {
    return {
      page,
      page_size: pageSize,
      users: [],
      total: listed.total ?? 0,
    };
  }

  const filteredUsers = search
    ? users.filter((user) => (user.email ?? "").toLowerCase().includes(search.toLowerCase()))
    : users;

  const userIds = filteredUsers.map((user) => user.id);
  const [{ data: profileRows, error: profileError }, { data: shortUrlRows, error: shortUrlError }] = await Promise.all([
    supabaseAdmin
      .from("profiles")
      .select("id, plan, billing_cycle, monthly_scans, stripe_subscription_id, subscription_ends_at, is_banned, banned_at, banned_reason")
      .in("id", userIds),
    supabaseAdmin
      .from("short_urls")
      .select("user_id, scan_count")
      .in("user_id", userIds),
  ]);

  if (profileError) {
    throw profileError;
  }
  if (shortUrlError) {
    throw shortUrlError;
  }

  const profilesById = new Map((profileRows ?? []).map((row) => [row.id, row]));
  const totalsByUser = new Map<string, { total_scans: number; total_tags: number }>();

  for (const row of shortUrlRows ?? []) {
    const userId = row.user_id as string | null;
    if (!userId) continue;
    const current = totalsByUser.get(userId) ?? { total_scans: 0, total_tags: 0 };
    current.total_scans += Number(row.scan_count ?? 0);
    current.total_tags += 1;
    totalsByUser.set(userId, current);
  }

  return {
    page,
    page_size: pageSize,
    total: listed.total ?? filteredUsers.length,
    users: filteredUsers.map((user) => {
      const profile = profilesById.get(user.id);
      const totals = totalsByUser.get(user.id) ?? { total_scans: 0, total_tags: 0 };
      return {
        id: user.id,
        email: user.email ?? "",
        created_at: user.created_at,
        plan: toPlan(profile?.plan),
        billing_cycle: (profile?.billing_cycle ?? "none") as BillingCycle,
        monthly_scans: Number(profile?.monthly_scans ?? 0),
        total_scans: totals.total_scans,
        total_tags: totals.total_tags,
        is_banned: Boolean(profile?.is_banned),
        banned_at: profile?.banned_at ?? null,
        banned_reason: profile?.banned_reason ?? null,
        stripe_subscription_id: profile?.stripe_subscription_id ?? null,
        subscription_ends_at: profile?.subscription_ends_at ?? null,
      };
    }),
  };
}

async function setUserPlan(
  supabaseAdmin: ReturnType<typeof createClient>,
  body: {
    targetUserId: string;
    targetPlan: Plan;
    downgradeTiming?: DowngradeTiming;
  },
) {
  const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
    apiVersion: "2024-04-10",
  });

  const downgradeTiming: DowngradeTiming = body.downgradeTiming === "period_end" ? "period_end" : "immediate";

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("id, plan, stripe_subscription_id, stripe_customer_id")
    .eq("id", body.targetUserId)
    .single();

  if (profileError || !profile) {
    throw profileError ?? new Error("Profile not found.");
  }

  const subscriptionId = profile.stripe_subscription_id as string | null;
  let customerId = profile.stripe_customer_id as string | null;
  const targetPlan = toPlan(body.targetPlan);
  const baseUpdate: Record<string, unknown> = {
    plan: targetPlan,
    billing_cycle: toBillingCycle(targetPlan),
    plan_override_source: "admin_manual",
    cancel_at_period_end: false,
  };

  if (targetPlan === "free") {
    if (subscriptionId) {
      if (downgradeTiming === "period_end") {
        await stripe.subscriptions.update(subscriptionId, {
          cancel_at_period_end: true,
        });

        const { error } = await supabaseAdmin
          .from("profiles")
          .update({
            cancel_at_period_end: true,
            plan_override_source: "admin_stripe",
          })
          .eq("id", body.targetUserId);

        if (error) throw error;

        return {
          ok: true,
          mode: "period_end",
          message: "Downgrade scheduled for period end.",
        };
      }

      const cancelled = await stripe.subscriptions.cancel(subscriptionId);
      baseUpdate.stripe_subscription_id = null;
      baseUpdate.subscription_ends_at = cancelled.ended_at
        ? new Date(cancelled.ended_at * 1000).toISOString()
        : new Date().toISOString();
      baseUpdate.canceled_at = new Date().toISOString();
      baseUpdate.cancel_at_period_end = false;
      baseUpdate.plan_override_source = "admin_stripe";
    }

    const { error } = await supabaseAdmin
      .from("profiles")
      .update(baseUpdate)
      .eq("id", body.targetUserId);

    if (error) throw error;

    return {
      ok: true,
      mode: "immediate",
      message: "Plan downgraded to free.",
    };
  }

  if (targetPlan === "premium_monthly" || targetPlan === "premium_yearly") {
    const targetPriceId = PRICE_IDS[targetPlan];
    if (!targetPriceId) {
      throw new Error(`Missing Stripe price configuration for ${targetPlan}.`);
    }

    if (!customerId) {
      const userResult = await supabaseAdmin.auth.admin.getUserById(body.targetUserId);
      if (userResult.error || !userResult.data.user?.email) {
        throw userResult.error ?? new Error("Could not resolve user email for Stripe customer creation.");
      }

      const createdCustomer = await stripe.customers.create({ email: userResult.data.user.email });
      customerId = createdCustomer.id;

      const { error: customerSaveError } = await supabaseAdmin
        .from("profiles")
        .update({ stripe_customer_id: customerId })
        .eq("id", body.targetUserId);

      if (customerSaveError) {
        throw customerSaveError;
      }
    }

    if (subscriptionId) {
      const existing = await stripe.subscriptions.retrieve(subscriptionId);
      const itemId = existing.items.data[0]?.id;
      if (!itemId) {
        throw new Error("Subscription line item missing.");
      }

      const updated = await stripe.subscriptions.update(subscriptionId, {
        cancel_at_period_end: false,
        items: [{ id: itemId, price: targetPriceId }],
        proration_behavior: downgradeTiming === "immediate" ? "create_prorations" : "none",
      });

      baseUpdate.subscription_ends_at = updated.current_period_end
        ? new Date(updated.current_period_end * 1000).toISOString()
        : null;
      baseUpdate.cancel_at_period_end = false;
      baseUpdate.canceled_at = null;
      baseUpdate.stripe_subscription_id = subscriptionId;
      baseUpdate.plan_override_source = "admin_stripe";
    } else {
      const createdSubscription = await stripe.subscriptions.create({
        customer: customerId,
        items: [{ price: targetPriceId }],
      });

      baseUpdate.stripe_subscription_id = createdSubscription.id;
      baseUpdate.subscription_ends_at = createdSubscription.current_period_end
        ? new Date(createdSubscription.current_period_end * 1000).toISOString()
        : null;
      baseUpdate.cancel_at_period_end = false;
      baseUpdate.canceled_at = null;
      baseUpdate.plan_override_source = "admin_stripe";
    }

    const { error } = await supabaseAdmin
      .from("profiles")
      .update(baseUpdate)
      .eq("id", body.targetUserId);

    if (error) throw error;

    return {
      ok: true,
      mode: "immediate",
      message: `Plan updated to ${targetPlan}.`,
    };
  }

  if (targetPlan === "lifetime") {
    if (subscriptionId) {
      if (downgradeTiming === "period_end") {
        await stripe.subscriptions.update(subscriptionId, {
          cancel_at_period_end: true,
        });

        const { error } = await supabaseAdmin
          .from("profiles")
          .update({
            cancel_at_period_end: true,
            plan_override_source: "admin_stripe",
          })
          .eq("id", body.targetUserId);

        if (error) throw error;

        return {
          ok: true,
          mode: "period_end",
          message: "Lifetime switch scheduled at subscription end.",
        };
      } else {
        await stripe.subscriptions.cancel(subscriptionId);
      }
    }

    const { error } = await supabaseAdmin
      .from("profiles")
      .update({
        ...baseUpdate,
        plan: "lifetime",
        billing_cycle: "lifetime",
        stripe_subscription_id: null,
        cancel_at_period_end: false,
        canceled_at: null,
        lifetime_activated_at: new Date().toISOString(),
        plan_override_source: "admin_manual",
      })
      .eq("id", body.targetUserId);

    if (error) throw error;

    return {
      ok: true,
      mode: downgradeTiming,
      message: "Plan updated to lifetime.",
    };
  }

  throw new Error("Unsupported plan target.");
}

async function setUserBan(
  supabaseAdmin: ReturnType<typeof createClient>,
  actorUserId: string,
  body: {
    targetUserId: string;
    isBanned: boolean;
    reason?: string;
  },
) {
  if (body.isBanned) {
    const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(body.targetUserId, {
      ban_duration: "876000h",
    });
    if (authError) {
      throw authError;
    }
  } else {
    const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(body.targetUserId, {
      ban_duration: "none",
    });
    if (authError) {
      throw authError;
    }
  }

  const { error: profileError } = await supabaseAdmin
    .from("profiles")
    .update({
      is_banned: body.isBanned,
      banned_at: body.isBanned ? new Date().toISOString() : null,
      banned_reason: body.isBanned ? (body.reason ?? null) : null,
      banned_by: body.isBanned ? actorUserId : null,
      plan_override_source: "admin_manual",
    })
    .eq("id", body.targetUserId);

  if (profileError) {
    throw profileError;
  }

  return {
    ok: true,
    message: body.isBanned ? "User banned." : "User unbanned.",
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  const adminCheck = await ensureAdmin(req);
  if ("response" in adminCheck) {
    return adminCheck.response;
  }

  const { supabaseAdmin, user } = adminCheck;

  try {
    const body = await req.json() as {
      action?: AdminAction;
      page?: number;
      pageSize?: number;
      search?: string;
      targetUserId?: string;
      targetPlan?: Plan;
      downgradeTiming?: DowngradeTiming;
      isBanned?: boolean;
      reason?: string;
    };

    const action = body.action;
    if (!action) {
      return jsonResponse({ error: "Missing action." }, 400);
    }

    if (action === "get_dashboard_metrics") {
      const metrics = await getDashboardMetrics(supabaseAdmin);
      return jsonResponse({ data: metrics });
    }

    if (action === "list_users") {
      const page = Number.isFinite(body.page) ? Math.max(1, Number(body.page)) : 1;
      const pageSize = Number.isFinite(body.pageSize) ? Math.min(200, Math.max(1, Number(body.pageSize))) : 50;
      const search = (body.search ?? "").trim();
      const users = await listUsers(supabaseAdmin, page, pageSize, search);
      return jsonResponse({ data: users });
    }

    if (action === "update_user_plan") {
      if (!body.targetUserId || !body.targetPlan) {
        return jsonResponse({ error: "targetUserId and targetPlan are required." }, 400);
      }
      const result = await setUserPlan(supabaseAdmin, {
        targetUserId: body.targetUserId,
        targetPlan: body.targetPlan,
        downgradeTiming: body.downgradeTiming,
      });
      return jsonResponse({ data: result });
    }

    if (action === "set_user_ban") {
      if (!body.targetUserId || typeof body.isBanned !== "boolean") {
        return jsonResponse({ error: "targetUserId and isBanned are required." }, 400);
      }
      const result = await setUserBan(supabaseAdmin, user.id, {
        targetUserId: body.targetUserId,
        isBanned: body.isBanned,
        reason: body.reason,
      });
      return jsonResponse({ data: result });
    }

    return jsonResponse({ error: "Unsupported action." }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[admin-panel] Error:", error);
    return jsonResponse({ error: message }, 500);
  }
});
