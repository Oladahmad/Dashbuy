import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");

  if (!code) return NextResponse.redirect(new URL("/auth/login", url));

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.session) {
    return NextResponse.redirect(new URL("/auth/login?e=1", url));
  }

  const userId = data.session.user.id;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  const role = profile?.role || "customer";
  const loginUrl = new URL("/auth/login", url);
  loginUrl.searchParams.set("confirmed", "1");

  if (role === "vendor_food" || role === "vendor_products") {
    loginUrl.searchParams.set("mode", "vendor");
  }

  return NextResponse.redirect(loginUrl);
}
