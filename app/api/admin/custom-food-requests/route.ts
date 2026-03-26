import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length).trim() : "";
    if (!token) {
      return NextResponse.json({ ok: false, error: "Missing auth token" }, { status: 401 });
    }

    const { data: authData, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !authData.user) {
      return NextResponse.json({ ok: false, error: "Invalid session" }, { status: 401 });
    }

    const userId = authData.user.id;
    const { data: profile, error: profileErr } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .maybeSingle<{ role: string }>();
    if (profileErr) {
      return NextResponse.json({ ok: false, error: profileErr.message }, { status: 500 });
    }
    if ((profile?.role ?? "") !== "admin") {
      return NextResponse.json({ ok: false, error: "Admin access required" }, { status: 403 });
    }

    const { data: requests, error: requestsErr } = await supabaseAdmin
      .from("custom_food_requests")
      .select("id,order_id,restaurant_name,plate_name,plate_fee,items_subtotal,total_amount,created_at")
      .order("created_at", { ascending: false })
      .limit(200);
    if (requestsErr) {
      return NextResponse.json({ ok: false, error: requestsErr.message }, { status: 500 });
    }

    const orderIds = (requests ?? []).map((r) => r.order_id).filter(Boolean);
    let orderDeliveryFee: Array<{ id: string; delivery_fee: number | null; notes: string | null }> = [];
    if (orderIds.length > 0) {
      const { data: orderRows, error: orderRowsErr } = await supabaseAdmin
        .from("orders")
        .select("id,delivery_fee,notes")
        .in("id", orderIds);
      if (orderRowsErr) {
        return NextResponse.json({ ok: false, error: orderRowsErr.message }, { status: 500 });
      }
      orderDeliveryFee = orderRows ?? [];
    }

    const requestIds = (requests ?? []).map((r) => r.id);
    let items: Array<{
      id: string;
      request_id: string;
      food_name: string;
      units: number;
      unit_price: number;
      line_total: number;
    }> = [];
    if (requestIds.length > 0) {
      const { data: rows, error: rowsErr } = await supabaseAdmin
        .from("custom_food_request_items")
        .select("id,request_id,food_name,units,unit_price,line_total")
        .in("request_id", requestIds)
        .order("id", { ascending: true });
      if (rowsErr) {
        return NextResponse.json({ ok: false, error: rowsErr.message }, { status: 500 });
      }
      items = rows ?? [];
    }

    return NextResponse.json({ ok: true, requests: requests ?? [], items, orderDeliveryFee });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unexpected error" },
      { status: 500 }
    );
  }
}
