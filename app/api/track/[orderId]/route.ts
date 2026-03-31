import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { resolveTrackingStatus } from "@/lib/orderTracking";
import { extractOrderNameFromNotes } from "@/lib/orderName";
import { parseManualLogisticsNotes } from "@/lib/manualLogistics";

export async function GET(_: Request, { params }: { params: Promise<{ orderId: string }> }) {
  try {
    const { orderId } = await params;
    const id = String(orderId ?? "").trim();
    if (!id) return NextResponse.json({ ok: false, error: "Missing order id" }, { status: 400 });

    const { data: order, error: orderErr } = await supabaseAdmin
      .from("orders")
      .select("id,status,total,delivery_address,customer_phone,notes,created_at")
      .eq("id", id)
      .maybeSingle<{
        id: string;
        status: string | null;
        total: number | null;
        delivery_address: string | null;
        customer_phone: string | null;
        notes: string | null;
        created_at: string;
      }>();
    if (orderErr) return NextResponse.json({ ok: false, error: orderErr.message }, { status: 500 });
    if (!order) return NextResponse.json({ ok: false, error: "Tracking not found" }, { status: 404 });

    const manual = parseManualLogisticsNotes(order.notes);
    if (!manual.isManual) {
      return NextResponse.json({ ok: false, error: "Tracking not available for this order" }, { status: 404 });
    }

    const { data: job } = await supabaseAdmin
      .from("logistics_jobs")
      .select("status")
      .eq("order_id", id)
      .maybeSingle<{ status: string | null }>();

    const effectiveStatus = resolveTrackingStatus(order.status, job?.status ?? null);
    const orderName = extractOrderNameFromNotes(order.notes) || "Delivery order";

    return NextResponse.json({
      ok: true,
      tracking: {
        orderId: order.id,
        orderName,
        status: effectiveStatus,
        total: Number(order.total ?? 0),
        address: order.delivery_address ?? "",
        phone: order.customer_phone ?? "",
        customerName: manual.customerName,
        itemsText: manual.itemsText,
        riderMapUrl: manual.riderMapUrl,
        createdAt: order.created_at,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unexpected error" },
      { status: 500 }
    );
  }
}
