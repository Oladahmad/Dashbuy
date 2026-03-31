import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { parseManualLogisticsNotes } from "@/lib/manualLogistics";

type Body = {
  orderId?: string;
};

function readBearerToken(req: NextRequest) {
  const h = req.headers.get("authorization") || "";
  const parts = h.split(" ");
  if (parts.length === 2 && parts[0].toLowerCase() === "bearer" && parts[1]) return parts[1].trim();
  return "";
}

export async function POST(req: NextRequest) {
  try {
    const token = readBearerToken(req);
    if (!token) return NextResponse.json({ ok: false, error: "Missing auth token" }, { status: 401 });

    const { data: authData, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !authData.user) return NextResponse.json({ ok: false, error: "Invalid session" }, { status: 401 });
    const actorId = authData.user.id;

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("role,full_name,phone,address")
      .eq("id", actorId)
      .maybeSingle<{ role: string; full_name: string | null; phone: string | null; address: string | null }>();

    const role = String(profile?.role ?? "");
    if (role !== "logistics" && role !== "admin") {
      return NextResponse.json({ ok: false, error: "Not authorized" }, { status: 403 });
    }

    const body = (await req.json()) as Body;
    const orderId = String(body.orderId ?? "").trim();
    if (!orderId) return NextResponse.json({ ok: false, error: "Missing orderId" }, { status: 400 });

    const { data: order, error: orderErr } = await supabaseAdmin
      .from("orders")
      .select("id,status,order_type,food_mode,total,customer_phone,delivery_address,notes")
      .eq("id", orderId)
      .maybeSingle<{
        id: string;
        status: string | null;
        order_type: string | null;
        food_mode: string | null;
        total: number | null;
        customer_phone: string | null;
        delivery_address: string | null;
        notes: string | null;
      }>();
    if (orderErr) return NextResponse.json({ ok: false, error: orderErr.message }, { status: 500 });
    if (!order) return NextResponse.json({ ok: false, error: "Order not found" }, { status: 404 });
    if (String(order.status ?? "") !== "pending_vendor") {
      return NextResponse.json({ ok: false, error: "Order is not in paid state" }, { status: 400 });
    }

    const manual = parseManualLogisticsNotes(order.notes);
    if (!manual.isManual) {
      return NextResponse.json({ ok: false, error: "This is not a manual logistics order" }, { status: 400 });
    }

    const { data: existingJob } = await supabaseAdmin
      .from("logistics_jobs")
      .select("id")
      .eq("order_id", order.id)
      .maybeSingle<{ id: string }>();
    if (existingJob?.id) {
      return NextResponse.json({ ok: false, error: "Delivery job already exists for this order" }, { status: 400 });
    }

    const vendorName = profile?.full_name?.trim() || "Logistics partner";
    const vendorPhone = profile?.phone?.trim() || null;
    const vendorAddress = profile?.address?.trim() || null;

    const { error: jobErr } = await supabaseAdmin.from("logistics_jobs").insert({
      order_id: order.id,
      vendor_id: actorId,
      customer_id: actorId,
      status: "pending_pickup",
      vendor_name: vendorName,
      vendor_phone: vendorPhone,
      vendor_address: vendorAddress,
      customer_name: manual.customerName || "Customer",
      customer_phone: order.customer_phone ?? "",
      delivery_address: order.delivery_address ?? "",
      order_type: order.order_type ?? "product",
      food_mode: order.food_mode,
      order_total: order.total ?? 0,
    });
    if (jobErr) return NextResponse.json({ ok: false, error: jobErr.message }, { status: 500 });

    const { error: orderUpdateErr } = await supabaseAdmin
      .from("orders")
      .update({ status: "accepted" })
      .eq("id", order.id);
    if (orderUpdateErr) return NextResponse.json({ ok: false, error: orderUpdateErr.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unexpected error" },
      { status: 500 }
    );
  }
}

