import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { withErrandQuoteMeta } from "@/lib/errandQuote";

type Body = {
  requestId?: string;
  quotedTotal?: number;
};

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length).trim() : "";
    if (!token) return NextResponse.json({ ok: false, error: "Missing auth token" }, { status: 401 });

    const { data: authData, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !authData.user) return NextResponse.json({ ok: false, error: "Invalid session" }, { status: 401 });

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", authData.user.id)
      .maybeSingle<{ role: string }>();

    if ((profile?.role ?? "") !== "admin") {
      return NextResponse.json({ ok: false, error: "Admin access required" }, { status: 403 });
    }

    const body = (await req.json()) as Body;
    const requestId = String(body.requestId ?? "").trim();
    const quotedTotal = Number(body.quotedTotal ?? 0);
    if (!requestId) return NextResponse.json({ ok: false, error: "Missing requestId" }, { status: 400 });
    if (!Number.isFinite(quotedTotal) || quotedTotal <= 0) {
      return NextResponse.json({ ok: false, error: "Quoted total must be greater than zero" }, { status: 400 });
    }

    const { data: requestRow, error: requestErr } = await supabaseAdmin
      .from("custom_food_requests")
      .select("id,order_id")
      .eq("id", requestId)
      .maybeSingle<{ id: string; order_id: string }>();
    if (requestErr) return NextResponse.json({ ok: false, error: requestErr.message }, { status: 500 });
    if (!requestRow) return NextResponse.json({ ok: false, error: "Request not found" }, { status: 404 });

    const { data: orderRow, error: orderErr } = await supabaseAdmin
      .from("orders")
      .select("id,delivery_fee,notes")
      .eq("id", requestRow.order_id)
      .maybeSingle<{ id: string; delivery_fee: number | null; notes: string | null }>();
    if (orderErr) return NextResponse.json({ ok: false, error: orderErr.message }, { status: 500 });
    if (!orderRow) return NextResponse.json({ ok: false, error: "Order not found" }, { status: 404 });

    const deliveryFee = Number(orderRow.delivery_fee ?? 0);
    const subtotal = Math.max(0, quotedTotal - deliveryFee);
    const nextNotes = withErrandQuoteMeta(orderRow.notes, {
      isErrand: true,
      status: "quoted",
      quotedTotal,
    });

    const { error: updateErr } = await supabaseAdmin
      .from("orders")
      .update({
        subtotal,
        total: quotedTotal,
        total_amount: quotedTotal,
        notes: nextNotes,
      })
      .eq("id", orderRow.id);

    if (updateErr) return NextResponse.json({ ok: false, error: updateErr.message }, { status: 500 });

    return NextResponse.json({ ok: true, quotedTotal, subtotal, deliveryFee });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unexpected error" },
      { status: 500 }
    );
  }
}

