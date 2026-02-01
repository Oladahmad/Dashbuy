import { supabase } from "@/lib/supabaseClient";
import type { User } from "@supabase/supabase-js";

export type VendorRole = "vendor_food" | "vendor_products" | "admin" | "customer";

export type ProfileRow = {
  id: string;
  role: VendorRole | null;
};

export type AuthedProfileResult =
  | { user: null; profile: null; role: null }
  | { user: User; profile: ProfileRow | null; role: VendorRole };

export async function getAuthedProfile(): Promise<AuthedProfileResult> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) return { user: null, profile: null, role: null };

  const user = data.user;

  const { data: profile, error: pErr } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("id", user.id)
    .maybeSingle<ProfileRow>();

  if (pErr) {
    return { user, profile: null, role: "customer" };
  }

  const role = ((profile?.role ?? "customer") as VendorRole) || "customer";
  return { user, profile: profile ?? null, role };
}

export function isVendorRole(role: VendorRole | null) {
  return role === "vendor_food" || role === "vendor_products" || role === "admin";
}
