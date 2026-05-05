import { createClient, type User } from "@supabase/supabase-js";
import { Profile, SupabaseShortUrlRow } from "../types";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

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

export async function signInWithGoogle() {
  if (!supabase) {
    throw new Error("Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
  }

  const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
  const redirectTo = `${window.location.origin}${base}/auth/callback`;

  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo,
    },
  });

  if (error) {
    throw error;
  }
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

export async function recordScan(
  code: string,
): Promise<{ original_url: string; scan_count: number } | { error: string }> {
  if (!supabase) return { error: "no_client" };
  const { data, error } = await supabase.rpc("record_scan", { p_code: code });
  if (error) return { error: error.message };
  return data as { original_url: string; scan_count: number } | { error: string };
}

export async function createCheckoutSession(origin: string): Promise<string> {
  if (!supabase) throw new Error("Supabase not configured.");
  const { data, error } = await supabase.functions.invoke("create-checkout-session", {
    body: { origin },
  });
  if (error) throw error;
  return (data as { url: string }).url;
}
