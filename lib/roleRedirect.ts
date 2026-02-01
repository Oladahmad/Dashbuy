import { supabase } from "./supabaseClient";

export async function getMyRole() {
  const { data: authData, error: authErr } = await supabase.auth.getUser();
  if (authErr || !authData?.user) return { role: null as null | string, userId: null as null | string };

  const userId = authData.user.id;

  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();

  if (profileErr) return { role: null, userId };

  return { role: profile?.role ?? null, userId };
}

export function roleToHome(role: string | null) {
  if (role === "vendor_food") return "/vendor";
  if (role === "vendor_products") return "/vendor";
  if (role === "admin") return "/admin";
  return "/"; // customer
}
