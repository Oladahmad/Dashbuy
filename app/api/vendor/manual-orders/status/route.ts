import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { parseManualLogisticsNotes } from "@/lib/manualLogistics";

type Body = {
  orderId?: string;
  nextStatus?: "accepted" | "picked_up" | "delivered";
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
      .select("role")
      .eq("id", actorId)
      .maybeSingle<{ role: string }>();
    const role = String(profile?.role ?? "");
    if (role !== "vendor_food" && role !== "vendor_products" && role !== "admin") {
      return NextResponse.json({ ok: false, error: "Not authorized" }, { status: 403 });
    }

    const body = (await req.json()) as Body;
    const orderId = String(body.orderId ?? "").trim();
    const nextStatus = String(body.nextStatus ?? "").trim() as Body["nextStatus"];
    if (!orderId) return NextResponse.json({ ok: false, error: "Missing orderId" }, { status: 400 });
    if (!nextStatus || !["accepted", "picked_up", "delivered"].includes(nextStatus)) {
      return NextResponse.json({ ok: false, error: "Invalid nextStatus" }, { status: 400 });
    }

    const { data: order, error: orderErr } = await supabaseAdmin
      .from("orders")
      .select("id,vendor_id,status,notes")
      .eq("id", orderId)
      .maybeSingle<{ id: string; vendor_id: string; status: string | null; notes: string | null }>();
    if (orderErr) return NextResponse.json({ ok: false, error: orderErr.message }, { status: 500 });
    if (!order) return NextResponse.json({ ok: false, error: "Order not found" }, { status: 404 });
    if (order.vendor_id !== actorId) return NextResponse.json({ ok: false, error: "Not allowed" }, { status: 403 });

    const manual = parseManualLogisticsNotes(order.notes);
    if (!manual.isManual || manual.source !== "vendor") {
      return NextResponse.json({ ok: false, error: "This is not a vendor manual order" }, { status: 400 });
    }

    const current = String(order.status ?? "");
    const allowed =
      (nextStatus === "accepted" && current === "pending_vendor") ||
      (nextStatus === "picked_up" && current === "accepted") ||
      (nextStatus === "delivered" && current === "picked_up");
    if (!allowed) {
      return NextResponse.json({ ok: false, error: "This status change is not allowed right now" }, { status: 400 });
    }

    const { error: updateErr } = await supabaseAdmin.from("orders").update({ status: nextStatus }).eq("id", order.id);
    if (updateErr) return NextResponse.json({ ok: false, error: updateErr.message }, { status: 500 });

    const { error: cleanupErr } = await supabaseAdmin.from("logistics_jobs").delete().eq("order_id", order.id);
    if (cleanupErr) {
      return NextResponse.json({ ok: false, error: "Manual order updated but logistics cleanup failed: " + cleanupErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unexpected error" },
      { status: 500 }
    );
  }
}
