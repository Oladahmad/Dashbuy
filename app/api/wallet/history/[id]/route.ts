import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { parseRejectReason } from "@/lib/orderRejection";

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

function extractOrderId(reference: string) {
  if (!reference.startsWith("wallet_reject_")) return "";
  return reference.slice("wallet_reject_".length).trim();
}

function isSyntheticRejectedId(id: string) {
  return id.startsWith("reject_order_");
}

function moneyValue(x: unknown) {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

function orderAmount(order: {
  subtotal?: number | null;
  delivery_fee?: number | null;
  total?: number | null;
  total_amount?: number | null;
}) {
  const totalAmount = moneyValue(order.total_amount);
  if (totalAmount > 0) return totalAmount;
  const total = moneyValue(order.total);
  if (total > 0) return total;
  return moneyValue(order.subtotal) + moneyValue(order.delivery_fee);
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const token = readBearerToken(req);
    if (!token) return NextResponse.json({ ok: false, error: "Missing token" }, { status: 401 });

    const anon = anonClient();
    const { data: authData, error: authErr } = await anon.auth.getUser(token);
    if (authErr || !authData.user) return NextResponse.json({ ok: false, error: "Invalid session" }, { status: 401 });

    const { id } = await ctx.params;
    const txId = String(id ?? "").trim();
    if (!txId) return NextResponse.json({ ok: false, error: "Missing wallet history id" }, { status: 400 });

    const a = adminClient();
    if (txId.startsWith("withdraw_")) {
      const withdrawId = txId.slice("withdraw_".length);
      const { data: row, error: withdrawErr } = await a
        .from("customer_withdraw_requests")
        .select("id,customer_id,amount,status,reference,bank_name,account_number,account_name,note,created_at,updated_at")
        .eq("id", withdrawId)
        .maybeSingle<{
          id: string;
          customer_id: string;
          amount: number | null;
          status: string | null;
          reference: string | null;
          bank_name: string | null;
          account_number: string | null;
          account_name: string | null;
          note: string | null;
          created_at: string;
          updated_at: string | null;
        }>();
      if (withdrawErr) return NextResponse.json({ ok: false, error: withdrawErr.message }, { status: 500 });
      if (!row || row.customer_id !== authData.user.id) {
        return NextResponse.json({ ok: false, error: "History item not found" }, { status: 404 });
      }
      return NextResponse.json({
        ok: true,
        item: {
          id: `withdraw_${row.id}`,
          amount: row.amount,
          reference: row.reference ?? "",
          provider: "dashbuy",
          type: "withdrawal_request",
          status: row.status,
          created_at: row.created_at,
          updated_at: row.updated_at,
        },
        withdrawRequest: row,
        rejectOrder: null,
        paymentOrders: [],
      });
    }

    if (isSyntheticRejectedId(txId)) {
      const orderId = txId.slice("reject_order_".length);
      const { data: order, error: orderErr } = await a
        .from("orders")
        .select("id,order_type,food_mode,status,subtotal,delivery_fee,total,total_amount,created_at,notes,vendor_id,customer_id")
        .eq("id", orderId)
        .maybeSingle<{
          id: string;
          order_type: string | null;
          food_mode: string | null;
          status: string | null;
          subtotal: number | null;
          delivery_fee: number | null;
          total: number | null;
          total_amount: number | null;
          created_at: string;
          notes: string | null;
          vendor_id: string;
          customer_id: string;
        }>();
      if (orderErr) return NextResponse.json({ ok: false, error: orderErr.message }, { status: 500 });
      if (!order || order.customer_id !== authData.user.id) {
        return NextResponse.json({ ok: false, error: "History item not found" }, { status: 404 });
      }
      const { data: vendor } = await a
        .from("profiles")
        .select("id,full_name,phone,address")
        .eq("id", order.vendor_id)
        .maybeSingle<{ id: string; full_name: string | null; phone: string | null; address: string | null }>();
      const { data: customer } = await a
        .from("profiles")
        .select("id,full_name,phone,address")
        .eq("id", order.customer_id)
        .maybeSingle<{ id: string; full_name: string | null; phone: string | null; address: string | null }>();
      return NextResponse.json({
        ok: true,
        item: {
          id: txId,
          amount: orderAmount(order),
          reference: `wallet_reject_${order.id}`,
          provider: "dashbuy",
          type: "rejected_refund",
          status: order.status,
          created_at: order.created_at,
          updated_at: null,
        },
        rejectOrder: {
          orderId: order.id,
          orderType: order.order_type,
          foodMode: order.food_mode,
          status: order.status,
          total: orderAmount(order),
          createdAt: order.created_at,
          reason: parseRejectReason(order.notes),
          vendor,
          customer,
        },
        paymentOrders: [],
        withdrawRequest: null,
      });
    }

    const { data: tx, error: txErr } = await a
      .from("wallet_transactions")
      .select("id,customer_id,amount,reference,provider,type,status,created_at,updated_at")
      .eq("id", txId)
      .maybeSingle<{
        id: string;
        customer_id: string;
        amount: number | null;
        reference: string;
        provider: string | null;
        type: string | null;
        status: string | null;
        created_at: string;
        updated_at: string | null;
      }>();

    if (txErr) return NextResponse.json({ ok: false, error: txErr.message }, { status: 500 });
    if (!tx || tx.customer_id !== authData.user.id) return NextResponse.json({ ok: false, error: "History item not found" }, { status: 404 });

    let rejectOrder: unknown = null;
    let paymentOrders: unknown[] = [];
    if (tx.type === "rejected_refund") {
      const orderId = extractOrderId(tx.reference);
      if (orderId) {
        const { data: order } = await a
          .from("orders")
          .select("id,order_type,food_mode,status,total,total_amount,created_at,notes,vendor_id,customer_id")
          .eq("id", orderId)
          .maybeSingle<{
            id: string;
            order_type: string | null;
            food_mode: string | null;
            status: string | null;
            total: number | null;
            total_amount: number | null;
            created_at: string;
            notes: string | null;
            vendor_id: string;
            customer_id: string;
          }>();

        if (order) {
          const { data: vendor } = await a
            .from("profiles")
            .select("id,full_name,phone,address")
            .eq("id", order.vendor_id)
            .maybeSingle<{ id: string; full_name: string | null; phone: string | null; address: string | null }>();
          const { data: customer } = await a
            .from("profiles")
            .select("id,full_name,phone,address")
            .eq("id", order.customer_id)
            .maybeSingle<{ id: string; full_name: string | null; phone: string | null; address: string | null }>();

          rejectOrder = {
            orderId: order.id,
            orderType: order.order_type,
            foodMode: order.food_mode,
            status: order.status,
            total: order.total_amount ?? order.total,
            createdAt: order.created_at,
            reason: parseRejectReason(order.notes),
            vendor,
            customer,
          };
        }
      }
    }

    if (tx.type === "payment") {
      const { data: orders } = await a
        .from("orders")
        .select("id,order_type,food_mode,status,total,total_amount,created_at,vendor_id")
        .eq("customer_id", authData.user.id)
        .eq("paystack_reference", tx.reference)
        .order("created_at", { ascending: false });

      paymentOrders = await Promise.all(
        ((orders ?? []) as Array<{
          id: string;
          order_type: string | null;
          food_mode: string | null;
          status: string | null;
          total: number | null;
          total_amount: number | null;
          created_at: string;
          vendor_id: string;
        }>).map(async (order) => {
          const { data: vendor } = await a
            .from("profiles")
            .select("full_name,phone,address")
            .eq("id", order.vendor_id)
            .maybeSingle<{ full_name: string | null; phone: string | null; address: string | null }>();
          return {
            orderId: order.id,
            orderType: order.order_type,
            foodMode: order.food_mode,
            status: order.status,
            total: order.total_amount ?? order.total,
            createdAt: order.created_at,
            vendor,
          };
        })
      );
    }

    return NextResponse.json({ ok: true, item: tx, rejectOrder, paymentOrders, withdrawRequest: null });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
