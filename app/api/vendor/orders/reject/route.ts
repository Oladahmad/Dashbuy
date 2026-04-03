import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { notifyOrderEvent } from "@/lib/orderNotifications";
import { appendRejectReason } from "@/lib/orderRejection";

type RejectBody = {
  orderId?: string;
  reason?: string;
};

type OrderMini = {
  id: string;
  vendor_id: string;
  customer_id: string;
  order_type: string | null;
  food_mode: string | null;
  total: number | null;
  total_amount: number | null;
  status: string | null;
  notes: string | null;
};

function adminClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false } });
}

function anonClient() {
  const url = process.env.SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) throw new Error("Missing SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
  return createClient(url, anon, { auth: { persistSession: false } });
}

function readBearerToken(req: Request) {
  const h = req.headers.get("authorization") || "";
  const parts = h.split(" ");
  if (parts.length === 2 && parts[0].toLowerCase() === "bearer" && parts[1]) return parts[1].trim();
  return "";
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as RejectBody;
    const orderId = String(body.orderId ?? "").trim();
    const reason = String(body.reason ?? "").trim();

    if (!orderId) {
      return NextResponse.json({ ok: false, error: "Missing orderId" }, { status: 400 });
    }
    if (!reason) {
      return NextResponse.json({ ok: false, error: "Decline reason is required" }, { status: 400 });
    }

    const token = readBearerToken(req);
    if (!token) {
      return NextResponse.json(
        { ok: false, error: "Missing Authorization Bearer token" },
        { status: 401 }
      );
    }

    const client = anonClient();
    const { data: authData, error: authErr } = await client.auth.getUser(token);
    if (authErr || !authData?.user) {
      return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });
    }

    const vendorId = authData.user.id;
    const a = adminClient();

    const { data: order, error: orderErr } = await a
      .from("orders")
      .select("id,vendor_id,customer_id,order_type,food_mode,total,total_amount,status,notes")
      .eq("id", orderId)
      .maybeSingle<OrderMini>();

    if (orderErr) return NextResponse.json({ ok: false, error: orderErr.message }, { status: 500 });
    if (!order) return NextResponse.json({ ok: false, error: "Order not found" }, { status: 404 });
    if (order.vendor_id !== vendorId) return NextResponse.json({ ok: false, error: "Not allowed" }, { status: 403 });
    if (order.status !== "pending_vendor") {
      return NextResponse.json({ ok: false, error: "Order is not pending_vendor" }, { status: 400 });
    }

    const nextNotes = appendRejectReason(order.notes, reason);
    const { data: updated, error: updErr } = await a
      .from("orders")
      .update({ status: "rejected", notes: nextNotes })
      .eq("id", orderId)
      .select("id,status,notes")
      .single();

    if (updErr) {
      return NextResponse.json({ ok: false, error: "Update order error: " + updErr.message }, { status: 500 });
    }

    await notifyOrderEvent({
      event: "vendor_rejected",
      orderId: order.id,
      vendorId,
      customerId: order.customer_id,
      amountNaira: order.total_amount ?? order.total,
      orderType: order.order_type,
    });

    return NextResponse.json({ ok: true, order: updated });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

