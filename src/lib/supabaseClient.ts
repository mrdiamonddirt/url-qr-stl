import { createClient, type User } from "@supabase/supabase-js";
import { PremiumAnalyticsResult, Profile, RecordScanResult, SupabaseShortUrlRow } from "../types";

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

  // For hash-based routing (Ionic), use the hash-based callback URL
  // OAuth redirect must use the actual origin, NOT BASE_URL (which includes GitHub Pages subpath)
  const redirectTo = `${window.location.origin}/#/auth/callback`;
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
    .select("id, short_code, original_url, scan_count, created_at")
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
    query = query.eq("plan", "premium");
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  if (!data || data.length === 0) {
    throw new Error("Premium plan required for instant redirect.");
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

export async function createCheckoutSession(origin: string): Promise<string> {
  if (!supabase) throw new Error("Supabase not configured.");
  
  console.log("[createCheckoutSession] Starting. Origin:", origin);
  
  try {
    const session = await supabase.auth.getSession();
    console.log("[createCheckoutSession] Auth session status:", session.data?.session ? "authenticated" : "not authenticated");
    
    const { data, error } = await supabase.functions.invoke("create-checkout-session", {
      body: { origin },
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
