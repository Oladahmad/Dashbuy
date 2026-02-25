import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { notifyOrderEvent } from "@/lib/orderNotifications";

type AcceptBody = {
  orderId?: string;
};

type OrderMini = {
  id: string;
  vendor_id: string;
  customer_id: string;
  order_type: string | null;
  food_mode: string | null;
  total: number | null;
  total_amount: number | null;
  delivery_address: string | null;
  customer_phone: string | null;
  notes: string | null;
  status: string | null;
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
    const body = (await req.json()) as AcceptBody;
    const orderId = String(body.orderId ?? "").trim();

    if (!orderId) {
      return NextResponse.json({ ok: false, error: "Missing orderId" }, { status: 400 });
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
      .select(
        "id,vendor_id,customer_id,order_type,food_mode,total,total_amount,delivery_address,customer_phone,notes,status"
      )
      .eq("id", orderId)
      .maybeSingle<OrderMini>();

    if (orderErr) {
      return NextResponse.json({ ok: false, error: orderErr.message }, { status: 500 });
    }

    if (!order) {
      return NextResponse.json({ ok: false, error: "Order not found" }, { status: 404 });
    }

    if (order.vendor_id !== vendorId) {
      return NextResponse.json({ ok: false, error: "Not allowed" }, { status: 403 });
    }

    if (order.status !== "pending_vendor") {
      return NextResponse.json({ ok: false, error: "Order is not pending_vendor" }, { status: 400 });
    }

    const { data: vendorProfile, error: vErr } = await a
      .from("profiles")
      .select("store_name,full_name,phone,store_address,address")
      .eq("id", vendorId)
      .maybeSingle();

    if (vErr) {
      return NextResponse.json(
        { ok: false, error: "Vendor profile error: " + vErr.message },
        { status: 500 }
      );
    }

    const { data: customerProfile, error: cErr } = await a
      .from("profiles")
      .select("full_name")
      .eq("id", order.customer_id)
      .maybeSingle();

    if (cErr) {
      return NextResponse.json(
        { ok: false, error: "Customer profile error: " + cErr.message },
        { status: 500 }
      );
    }

    const vendorName =
      String(vendorProfile?.store_name ?? "").trim() ||
      String(vendorProfile?.full_name ?? "").trim() ||
      "Vendor";
    const vendorPhone = String(vendorProfile?.phone ?? "").trim();
    const vendorAddress =
      String(vendorProfile?.store_address ?? "").trim() ||
      String(vendorProfile?.address ?? "").trim();
    const customerName = String(customerProfile?.full_name ?? "Customer").trim() || "Customer";

    const gross = Number(order.total_amount ?? order.total ?? 0);

    const { data: jobData, error: jobErr } = await a
      .from("logistics_jobs")
      .upsert(
        {
          order_id: order.id,
          vendor_id: vendorId,
          customer_id: order.customer_id,
          status: "pending_pickup",
          vendor_name: vendorName,
          vendor_phone: vendorPhone || null,
          vendor_address: vendorAddress || null,
          customer_name: customerName,
          customer_phone: order.customer_phone || null,
          delivery_address: order.delivery_address || null,
          order_type: order.order_type,
          food_mode: order.food_mode,
          order_total: Number.isFinite(gross) ? gross : 0,
        },
        { onConflict: "order_id" }
      )
      .select("id")
      .maybeSingle();

    if (jobErr) {
      return NextResponse.json(
        { ok: false, error: "Create logistics job error: " + jobErr.message },
        { status: 500 }
      );
    }

    const { data: updated, error: updErr } = await a
      .from("orders")
      .update({ status: "accepted" })
      .eq("id", orderId)
      .select("id,status")
      .single();

    if (updErr) {
      return NextResponse.json(
        { ok: false, error: "Update order error: " + updErr.message },
        { status: 500 }
      );
    }

    await notifyOrderEvent({
      event: "vendor_accepted",
      orderId: order.id,
      vendorId,
      customerId: order.customer_id,
      amountNaira: order.total_amount ?? order.total,
      orderType: order.order_type,
    });

    return NextResponse.json({ ok: true, jobId: jobData?.id ?? null, order: updated });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
