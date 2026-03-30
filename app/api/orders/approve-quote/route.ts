import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { parseErrandQuote, withErrandQuoteMeta } from "@/lib/errandQuote";

type Body = {
  orderId?: string;
  orderIds?: string[];
};

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length).trim() : "";
    if (!token) return NextResponse.json({ ok: false, error: "Missing auth token" }, { status: 401 });

    const { data: authData, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !authData.user) return NextResponse.json({ ok: false, error: "Invalid session" }, { status: 401 });
    const userId = authData.user.id;

    const body = (await req.json()) as Body;
    const single = String(body.orderId ?? "").trim();
    const list = Array.isArray(body.orderIds) ? body.orderIds.map((x) => String(x).trim()).filter(Boolean) : [];
    const ids = Array.from(new Set(single ? [single, ...list] : list));
    if (ids.length === 0) return NextResponse.json({ ok: false, error: "Missing orderId" }, { status: 400 });

    const { data: rows, error: rowsErr } = await supabaseAdmin
      .from("orders")
      .select("id,customer_id,status,notes")
      .in("id", ids);
    if (rowsErr) return NextResponse.json({ ok: false, error: rowsErr.message }, { status: 500 });
    if (!rows || rows.length !== ids.length) return NextResponse.json({ ok: false, error: "Order not found" }, { status: 404 });

    for (const row of rows) {
      if (String(row.customer_id) !== userId) {
        return NextResponse.json({ ok: false, error: "Not allowed for this order" }, { status: 403 });
      }
      if (String(row.status ?? "") !== "pending_payment") {
        return NextResponse.json({ ok: false, error: "Order is not pending payment" }, { status: 400 });
      }
      const meta = parseErrandQuote(String(row.notes ?? ""));
      if (meta.isErrand && meta.status !== "quoted") {
        return NextResponse.json({ ok: false, error: "Quote is not ready for approval yet" }, { status: 400 });
      }
    }

    for (const row of rows) {
      const meta = parseErrandQuote(String(row.notes ?? ""));
      if (!meta.isErrand) continue;
      const nextNotes = withErrandQuoteMeta(String(row.notes ?? ""), {
        isErrand: true,
        status: "approved",
        quotedTotal: meta.quotedTotal ?? undefined,
      });
      const { error: updateErr } = await supabaseAdmin.from("orders").update({ notes: nextNotes }).eq("id", row.id);
      if (updateErr) return NextResponse.json({ ok: false, error: updateErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unexpected error" },
      { status: 500 }
    );
  }
}

