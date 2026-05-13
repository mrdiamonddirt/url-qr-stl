import { CheckoutTargetPlan, Plan } from "../types";

export const PLAN_PRICES_GBP: Record<CheckoutTargetPlan, number> = {
  premium_monthly: 3.99,
  premium_yearly: 39.99,
  lifetime: 109.99,
};

export const PLAN_DISPLAY_NAMES: Record<Plan, string> = {
  free: "Free",
  premium: "Premium",
  premium_monthly: "Premium Monthly",
  premium_yearly: "Premium Yearly",
  lifetime: "Lifetime",
};

export type PlanLimits = {
  maxActiveTags: number;
  monthlyScanLimit: number;
  maxLogos: number;
  prioritySupport: boolean;
};

export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  free: { maxActiveTags: 3, monthlyScanLimit: 20, maxLogos: 0, prioritySupport: false },
  premium: { maxActiveTags: 20, monthlyScanLimit: 10000, maxLogos: 5, prioritySupport: false },
  premium_monthly: { maxActiveTags: 20, monthlyScanLimit: 10000, maxLogos: 5, prioritySupport: false },
  premium_yearly: { maxActiveTags: 20, monthlyScanLimit: 10000, maxLogos: 5, prioritySupport: false },
  lifetime: { maxActiveTags: 40, monthlyScanLimit: 25000, maxLogos: 10, prioritySupport: true },
};

export function normalizePlan(plan: Plan | string | null | undefined): Plan {
  if (plan === "premium" || plan === "premium_monthly" || plan === "premium_yearly" || plan === "lifetime") {
    return plan;
  }
  return "free";
}

export function isPaidPlan(plan: Plan | string | null | undefined): boolean {
  return normalizePlan(plan) !== "free";
}

export function isSubscriptionPlan(plan: Plan | string | null | undefined): boolean {
  const normalized = normalizePlan(plan);
  return normalized === "premium" || normalized === "premium_monthly" || normalized === "premium_yearly";
}

export function getPlanLimits(plan: Plan | string | null | undefined): PlanLimits {
  return PLAN_LIMITS[normalizePlan(plan)];
}

export function getPlanLabel(plan: Plan | string | null | undefined): string {
  return PLAN_DISPLAY_NAMES[normalizePlan(plan)];
}

export function formatPlanPrice(plan: CheckoutTargetPlan): string {
  const amount = PLAN_PRICES_GBP[plan];
  if (plan === "premium_monthly") {
    return `£${amount.toFixed(2)}/mo`;
  }
  if (plan === "premium_yearly") {
    return `£${amount.toFixed(2)}/yr`;
  }
  return `£${amount.toFixed(2)} one-time`;
}

export function getUpgradeCreditCents(sourcePlan: Plan | string | null | undefined, targetPlan: CheckoutTargetPlan): number {
  const normalized = normalizePlan(sourcePlan);
  const source = normalized === "premium" ? "premium_monthly" : normalized;
  if (source === "premium_monthly" && (targetPlan === "premium_yearly" || targetPlan === "lifetime")) {
    return 399;
  }
  if (source === "premium_yearly" && targetPlan === "lifetime") {
    return 3999;
  }
  return 0;
}

export function getUpgradeCreditLabel(sourcePlan: Plan | string | null | undefined, targetPlan: CheckoutTargetPlan): string {
  const cents = getUpgradeCreditCents(sourcePlan, targetPlan);
  if (!cents) return "";
  return `Includes £${(cents / 100).toFixed(2)} upgrade credit`;
}

export function getAllowedCheckoutTargets(sourcePlan: Plan | string | null | undefined): CheckoutTargetPlan[] {
  const normalized = normalizePlan(sourcePlan);
  if (normalized === "free") {
    return ["premium_monthly", "premium_yearly", "lifetime"];
  }
  if (normalized === "premium" || normalized === "premium_monthly") {
    return ["premium_yearly", "lifetime"];
  }
  if (normalized === "premium_yearly") {
    return ["lifetime"];
  }
  return [];
}
