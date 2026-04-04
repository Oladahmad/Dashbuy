import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

function readBearerToken(req: Request) {
  const h = req.headers.get("authorization") || "";
  const [scheme, token] = h.split(" ");
  if (scheme?.toLowerCase() === "bearer" && token) return token.trim();
  return "";
}

export async function GET(req: Request) {
  try {
    const token = readBearerToken(req);
    if (!token) return NextResponse.json({ ok: false, error: "Missing Authorization Bearer token" }, { status: 401 });

    const { data: authData, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !authData.user) return NextResponse.json({ ok: false, error: "Invalid session" }, { status: 401 });

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", authData.user.id)
      .maybeSingle<{ role: string | null }>();
    if ((profile?.role ?? "") !== "admin") {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const { data: orderRows, error: orderErr } = await supabaseAdmin
      .from("order_dedicated_accounts")
      .select("id,amount,last_paid_amount,created_at,paid_at,order_ids")
      .eq("status", "mismatch")
      .order("created_at", { ascending: false })
      .limit(20);
    if (orderErr) return NextResponse.json({ ok: false, error: orderErr.message }, { status: 500 });

    const { data: walletRows, error: walletErr } = await supabaseAdmin
      .from("wallet_dedicated_accounts")
      .select("id,amount,last_paid_amount,created_at,paid_at")
      .eq("status", "mismatch")
      .order("created_at", { ascending: false })
      .limit(20);
    if (walletErr) return NextResponse.json({ ok: false, error: walletErr.message }, { status: 500 });

    return NextResponse.json({
      ok: true,
      mismatches: {
        orders: orderRows ?? [],
        wallets: walletRows ?? [],
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

