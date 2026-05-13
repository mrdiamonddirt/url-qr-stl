import { createClient, type User } from "@supabase/supabase-js";
import {
  AdminBanUpdateResult,
  AdminDashboardMetrics,
  AdminDowngradeTiming,
  AdminPlanUpdateResult,
  AdminUsersListResult,
  CheckoutTargetPlan,
  Plan,
  PremiumAnalyticsResult,
  Profile,
  RecordScanResult,
  SupabaseShortUrlRow,
  UserLogo,
} from "../types";
import { getPlanLimits } from "./plans";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

console.log("[supabaseClient] VITE_SUPABASE_URL configured:", !!supabaseUrl);
console.log("[supabaseClient] VITE_SUPABASE_ANON_KEY configured:", !!supabaseAnonKey);

export const supabase =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          flowType: 'pkce',
        },
      })
    : null;

if (!supabase) {
  console.error("[supabaseClient] ERROR: Supabase not configured! Missing environment variables.", {
    url: !!supabaseUrl,
    key: !!supabaseAnonKey
  });
}

export async function signInWithGoogle() {
  if (!supabase) {
    throw new Error("Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
  }

  // Use PKCE flow: Supabase appends ?code= (not #fragment), so use path-based redirect.
  // BASE_URL is root (`/`) so callback URL resolves to /auth/callback.
  const base = import.meta.env.BASE_URL ?? '/';
  const redirectTo = `${window.location.origin}${base}auth/callback`;
  console.log("[signInWithGoogle] Constructed redirect URL:", redirectTo);
  
  localStorage.setItem("url-qr-stl.return-to", "/editor");

  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo,
    },
  });

  if (error) {
    console.error("[signInWithGoogle] OAuth error:", error);
    throw error;
  }
  
  console.log("[signInWithGoogle] OAuth initiated successfully");
}

export async function signOut() {
  if (!supabase) {
    return;
  }

  await supabase.auth.signOut();
}

export async function getCurrentUser(): Promise<User | null> {
  if (!supabase) {
    return null;
  }

  const { data } = await supabase.auth.getUser();
  return data.user;
}

export async function getProfile(userId: string): Promise<Profile | null> {
  if (!supabase) return null;
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();
  return (data as Profile) ?? null;
}

export async function getUserShortUrls(userId: string): Promise<SupabaseShortUrlRow[]> {
  if (!supabase) return [];
  const { data } = await supabase
    .from("short_urls")
    .select("id, short_code, original_url, template_id, template_payload, qr_type, frame_logo_id, scan_count, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(20);
  return (data as SupabaseShortUrlRow[]) ?? [];
}

export async function deleteShortUrl(shortCode: string, userId: string): Promise<void> {
  if (!supabase) return;
  await supabase
    .from("short_urls")
    .delete()
    .eq("short_code", shortCode)
    .eq("user_id", userId);
}

export async function updateProfileRedirectMode(userId: string, redirectMode: "instant" | "interstitial"): Promise<void> {
  if (!supabase) {
    return;
  }

  let query = supabase
    .from("profiles")
    .update({ redirect_mode: redirectMode })
    .eq("id", userId)
    .select("id, plan, redirect_mode");

  if (redirectMode === "instant") {
    // Prevent invalid writes when client plan state is stale.
    query = query.in("plan", ["premium", "premium_monthly", "premium_yearly", "lifetime"]);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  if (!data || data.length === 0) {
    throw new Error("Paid plan required for direct link.");
  }
}

export async function recordScan(
  code: string,
): Promise<RecordScanResult> {
  if (!supabase) return { error: "no_client" };
  const { data, error } = await supabase.rpc("record_scan", { p_code: code });
  if (error) return { error: error.message };
  return data as RecordScanResult;
}

export async function createCheckoutSession(origin: string, targetPlan: CheckoutTargetPlan = "premium_monthly"): Promise<string> {
  if (!supabase) throw new Error("Supabase not configured.");
  const basePath = import.meta.env.BASE_URL ?? "/";
  
  console.log("[createCheckoutSession] Starting. Origin:", origin);
  
  try {
    const session = await supabase.auth.getSession();
    console.log("[createCheckoutSession] Auth session status:", session.data?.session ? "authenticated" : "not authenticated");
    
    const { data, error } = await supabase.functions.invoke("create-checkout-session", {
      body: { origin, targetPlan, basePath },
    });
    
    if (error) {
      console.error("[createCheckoutSession] Function error:", error);
      throw error;
    }
    
    console.log("[createCheckoutSession] Function response received:", data);
    
    const url = (data as { url?: string }).url;
    if (!url) {
      throw new Error("No checkout URL in response: " + JSON.stringify(data));
    }
    
    return url;
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error("[createCheckoutSession] Full error:", errorMsg);
    throw err;
  }
}

export async function createBillingPortalSession(origin: string): Promise<string> {
  if (!supabase) throw new Error("Supabase not configured.");
  const basePath = import.meta.env.BASE_URL ?? "/";

  const { data, error } = await supabase.functions.invoke("create-billing-portal-session", {
    body: { origin, basePath },
  });

  if (error) {
    throw error;
  }

  const url = (data as { url?: string }).url;
  if (!url) {
    throw new Error("No billing portal URL in response.");
  }

  return url;
}

export async function getPremiumScanAnalytics(userId: string, days = 14): Promise<PremiumAnalyticsResult> {
  if (!supabase) {
    return { error: "no_client" };
  }

  const { data, error } = await supabase.rpc("get_premium_scan_analytics", {
    p_user_id: userId,
    p_days: days,
  });

  if (error) {
    return { error: error.message };
  }

  return data as PremiumAnalyticsResult;
}

const LOGO_BUCKET = "user-logos";
const DEFAULT_LOGO_LIMIT = 5;

function getFileExtension(file: File): string {
  if (file.type === "image/png") return "png";
  if (file.type === "image/jpeg") return "jpg";
  if (file.type === "image/webp") return "webp";
  const nameParts = file.name.split(".");
  return (nameParts[nameParts.length - 1] || "bin").toLowerCase();
}

function toUserLogo(row: Omit<UserLogo, "public_url">): UserLogo {
  if (!supabase) {
    return { ...row, public_url: "" };
  }
  const { data } = supabase.storage.from(LOGO_BUCKET).getPublicUrl(row.storage_path);
  return { ...row, public_url: data.publicUrl };
}

export async function listUserLogos(userId: string): Promise<UserLogo[]> {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("user_logos")
    .select("id, user_id, storage_path, mime_type, file_size_bytes, width_px, height_px, is_default, is_active, created_at, updated_at")
    .eq("user_id", userId)
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return ((data as Array<Omit<UserLogo, "public_url">>) ?? []).map(toUserLogo);
}

export async function uploadUserLogo(
  userId: string,
  file: File,
  dimensions: { width: number; height: number },
  isDefault = false
): Promise<UserLogo> {
  if (!supabase) throw new Error("Supabase not configured.");

  const ext = getFileExtension(file);
  const objectName = `${userId}/${Date.now()}-${crypto.randomUUID()}.${ext}`;

  const { error: storageError } = await supabase.storage
    .from(LOGO_BUCKET)
    .upload(objectName, file, {
      contentType: file.type,
      upsert: false,
      cacheControl: "3600",
    });

  if (storageError) {
    throw storageError;
  }

  if (isDefault) {
    await supabase
      .from("user_logos")
      .update({ is_default: false })
      .eq("user_id", userId)
      .eq("is_active", true);
  }

  const { data, error } = await supabase
    .from("user_logos")
    .insert({
      user_id: userId,
      storage_path: objectName,
      mime_type: file.type,
      file_size_bytes: file.size,
      width_px: dimensions.width,
      height_px: dimensions.height,
      is_default: isDefault,
      is_active: true,
    })
    .select("id, user_id, storage_path, mime_type, file_size_bytes, width_px, height_px, is_default, is_active, created_at, updated_at")
    .single();

  if (error || !data) {
    await supabase.storage.from(LOGO_BUCKET).remove([objectName]);
    throw error ?? new Error("Could not save logo metadata.");
  }

  return toUserLogo(data as Omit<UserLogo, "public_url">);
}

export async function setDefaultUserLogo(userId: string, logoId: string): Promise<void> {
  if (!supabase) throw new Error("Supabase not configured.");

  const { error: resetError } = await supabase
    .from("user_logos")
    .update({ is_default: false })
    .eq("user_id", userId)
    .eq("is_active", true);

  if (resetError) {
    throw resetError;
  }

  const { error } = await supabase
    .from("user_logos")
    .update({ is_default: true })
    .eq("id", logoId)
    .eq("user_id", userId)
    .eq("is_active", true);

  if (error) {
    throw error;
  }
}

export async function deleteUserLogo(userId: string, logoId: string): Promise<void> {
  if (!supabase) throw new Error("Supabase not configured.");

  const { data, error: readError } = await supabase
    .from("user_logos")
    .select("storage_path")
    .eq("id", logoId)
    .eq("user_id", userId)
    .single();

  if (readError) {
    throw readError;
  }

  const storagePath = (data as { storage_path: string }).storage_path;
  await supabase.storage.from(LOGO_BUCKET).remove([storagePath]);

  const { error } = await supabase
    .from("user_logos")
    .update({ is_active: false, is_default: false })
    .eq("id", logoId)
    .eq("user_id", userId);

  if (error) {
    throw error;
  }
}

export function getLogoLimit(plan?: string | null) {
  if (!plan) {
    return DEFAULT_LOGO_LIMIT;
  }
  return getPlanLimits(plan).maxLogos;
}

type AdminPanelAction = "get_dashboard_metrics" | "list_users" | "update_user_plan" | "set_user_ban";

type AdminPanelBasePayload = {
  action: AdminPanelAction;
};

type AdminPanelResponse<T> = {
  data?: T;
  error?: string;
};

export const OWNER_ADMIN_EMAIL = "woodrowan@gmail.com";

export function isOwnerAdminEmail(email: string | null | undefined): boolean {
  return (email ?? "").toLowerCase() === OWNER_ADMIN_EMAIL;
}

async function invokeAdminPanel<T>(payload: AdminPanelBasePayload & Record<string, unknown>): Promise<T> {
  if (!supabase) {
    throw new Error("Supabase not configured.");
  }

  const { data, error } = await supabase.functions.invoke("admin-panel", {
    body: payload,
  });

  if (error) {
    throw error;
  }

  const parsed = (data as AdminPanelResponse<T>) ?? {};
  if (parsed.error) {
    throw new Error(parsed.error);
  }

  if (!parsed.data) {
    throw new Error("Admin response did not include data.");
  }

  return parsed.data;
}

export async function getAdminDashboardMetrics(): Promise<AdminDashboardMetrics> {
  return invokeAdminPanel<AdminDashboardMetrics>({ action: "get_dashboard_metrics" });
}

export async function listAdminUsers(page = 1, pageSize = 50, search = ""): Promise<AdminUsersListResult> {
  return invokeAdminPanel<AdminUsersListResult>({
    action: "list_users",
    page,
    pageSize,
    search,
  });
}

export async function updateAdminUserPlan(
  targetUserId: string,
  targetPlan: Plan,
  downgradeTiming: AdminDowngradeTiming,
): Promise<AdminPlanUpdateResult> {
  return invokeAdminPanel<AdminPlanUpdateResult>({
    action: "update_user_plan",
    targetUserId,
    targetPlan,
    downgradeTiming,
  });
}

export async function setAdminUserBan(
  targetUserId: string,
  isBanned: boolean,
  reason = "",
): Promise<AdminBanUpdateResult> {
  return invokeAdminPanel<AdminBanUpdateResult>({
    action: "set_user_ban",
    targetUserId,
    isBanned,
    reason,
  });
}
