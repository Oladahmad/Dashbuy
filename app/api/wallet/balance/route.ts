import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function anonClient() {
  const url = process.env.SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) throw new Error("Missing SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
  return createClient(url, anon, { auth: { persistSession: false } });
}

function readBearerToken(req: Request) {
  const h = req.headers.get("authorization") || "";
  const [scheme, token] = h.split(" ");
  if (scheme?.toLowerCase() === "bearer" && token) return token.trim();
  return "";
}

export async function GET(req: Request) {
  try {
    const token = readBearerToken(req);
    if (!token) return NextResponse.json({ ok: false, error: "Missing token" }, { status: 401 });

    const anon = anonClient();
    const { data: authData, error: authErr } = await anon.auth.getUser(token);
    if (authErr || !authData.user) return NextResponse.json({ ok: false, error: "Invalid session" }, { status: 401 });

    const customerId = authData.user.id;
    const url = process.env.SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anonKey) {
      return NextResponse.json({ ok: false, error: "Supabase env missing" }, { status: 500 });
    }
    const client = createClient(url, anonKey, {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const { data, error } = await client
      .from("customer_wallets")
      .select("balance")
      .eq("customer_id", customerId)
      .maybeSingle<{ balance: number | null }>();

    if (error) {
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (serviceKey) {
        const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
        const { data: adminData, error: adminErr } = await admin
          .from("customer_wallets")
          .select("balance")
          .eq("customer_id", customerId)
          .maybeSingle<{ balance: number | null }>();
        if (!adminErr) {
          return NextResponse.json({ ok: true, balance: Number(adminData?.balance ?? 0) });
        }
        console.error("wallet/balance admin error", adminErr);
        return NextResponse.json({ ok: false, error: adminErr.message }, { status: 500 });
      }
      console.error("wallet/balance supabase error", error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, balance: Number(data?.balance ?? 0) });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Server error";
    console.error("wallet/balance error", e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
