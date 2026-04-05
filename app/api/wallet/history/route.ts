import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function anonClient() {
  const url = process.env.SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) throw new Error("Missing SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
  return createClient(url, anon, { auth: { persistSession: false } });
}

function adminClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false } });
}

function readBearerToken(req: Request) {
  const h = req.headers.get("authorization") || "";
  const [scheme, token] = h.split(" ");
  if (scheme?.toLowerCase() === "bearer" && token) return token.trim();
  return "";
}

function normalizeFilter(value: string | null) {
  const v = String(value ?? "all").trim().toLowerCase();
  if (v === "bank_funding") return "bank_funding";
  if (v === "rejected") return "rejected";
  if (v === "spent") return "spent";
  if (v === "withdrawal") return "withdrawal";
  return "all";
}

function rejectSyntheticId(orderId: string) {
  return `reject_order_${orderId}`;
}

function moneyValue(x: unknown) {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

function orderAmount(row: Record<string, unknown>) {
  const totalAmount = moneyValue(row.total_amount);
  if (totalAmount > 0) return totalAmount;
  const total = moneyValue(row.total);
  if (total > 0) return total;
  return moneyValue(row.subtotal) + moneyValue(row.delivery_fee);
}

export async function GET(req: Request) {
  try {
    const token = readBearerToken(req);
    if (!token) return NextResponse.json({ ok: false, error: "Missing token" }, { status: 401 });

    const anon = anonClient();
    const { data: authData, error: authErr } = await anon.auth.getUser(token);
    if (authErr || !authData.user) return NextResponse.json({ ok: false, error: "Invalid session" }, { status: 401 });

    const filter = normalizeFilter(new URL(req.url).searchParams.get("filter"));
    const a = adminClient();
    let query = a
      .from("wallet_transactions")
      .select("id,customer_id,amount,reference,provider,type,status,created_at,updated_at")
      .eq("customer_id", authData.user.id)
      .order("created_at", { ascending: false });

    if (filter === "bank_funding") query = query.eq("type", "topup");
    if (filter === "rejected") query = query.eq("type", "rejected_refund");
    if (filter === "spent") query = query.eq("type", "payment");

    const { data, error } = await query;
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    const walletItems = ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
      id: String(row.id),
      amount: Number(row.amount ?? 0),
      reference: String(row.reference ?? ""),
      provider: row.provider == null ? null : String(row.provider),
      type: row.type == null ? null : String(row.type),
      status: row.status == null ? null : String(row.status),
      created_at: String(row.created_at ?? ""),
      updated_at: row.updated_at == null ? null : String(row.updated_at),
      source: "wallet_transaction",
    }));

    let syntheticRejectedItems: Array<Record<string, unknown>> = [];
    if (filter === "all" || filter === "rejected") {
      const rejectRefs = new Set(
        walletItems
          .filter((row) => String(row.type ?? "") === "rejected_refund")
          .map((row) => String(row.reference ?? ""))
      );

      const { data: rejectedOrders, error: rejectedErr } = await a
        .from("orders")
        .select("id,subtotal,delivery_fee,total,total_amount,status,created_at")
        .eq("customer_id", authData.user.id)
        .in("status", ["rejected", "declined"])
        .order("created_at", { ascending: false });
      if (rejectedErr) return NextResponse.json({ ok: false, error: rejectedErr.message }, { status: 500 });

      syntheticRejectedItems = ((rejectedOrders ?? []) as Array<Record<string, unknown>>)
        .filter((row) => !rejectRefs.has(`wallet_reject_${String(row.id)}`))
        .map((row) => ({
          id: rejectSyntheticId(String(row.id)),
          amount: orderAmount(row),
          reference: `wallet_reject_${String(row.id)}`,
          provider: "dashbuy",
          type: "rejected_refund",
          status: String(row.status ?? "rejected"),
          created_at: String(row.created_at ?? ""),
          updated_at: null,
          source: "rejected_order_fallback",
        }));
    }

    let withdrawalItems: Array<Record<string, unknown>> = [];
    if (filter === "all" || filter === "withdrawal") {
      const { data: withdrawRows, error: withdrawErr } = await a
        .from("customer_withdraw_requests")
        .select("id,amount,status,reference,created_at,updated_at")
        .eq("customer_id", authData.user.id)
        .order("created_at", { ascending: false });
      if (withdrawErr) return NextResponse.json({ ok: false, error: withdrawErr.message }, { status: 500 });
      withdrawalItems = ((withdrawRows ?? []) as Array<Record<string, unknown>>).map((row) => ({
        id: `withdraw_${String(row.id)}`,
        amount: Number(row.amount ?? 0),
        reference: String(row.reference ?? ""),
        provider: "dashbuy",
        type: "withdrawal_request",
        status: row.status == null ? null : String(row.status),
        created_at: String(row.created_at ?? ""),
        updated_at: row.updated_at == null ? null : String(row.updated_at),
        source: "withdraw_request",
      }));
    }

    const items = [...walletItems, ...syntheticRejectedItems, ...withdrawalItems].sort((a, b) =>
      String(b.created_at ?? "").localeCompare(String(a.created_at ?? ""))
    );

    return NextResponse.json({ ok: true, items });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
