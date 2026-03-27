import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type ReqBody = {
  orderIds?: string[];
};

function readBearerToken(req: Request) {
  const h = req.headers.get("authorization") || "";
  const [scheme, token] = h.split(" ");
  if (scheme?.toLowerCase() === "bearer" && token) return token.trim();
  return "";
}

export async function POST(req: Request) {
  try {
    const token = readBearerToken(req);
    if (!token) return NextResponse.json({ ok: false, error: "Missing token" }, { status: 401 });

    const { data: authData, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !authData.user) {
      return NextResponse.json({ ok: false, error: "Invalid session" }, { status: 401 });
    }

    const actorId = authData.user.id;
    const { data: actorProfile } = await supabaseAdmin
      .from("profiles")
      .select("id,role")
      .eq("id", actorId)
      .maybeSingle<{ id: string; role: string }>();
    const role = String(actorProfile?.role ?? "");
    if (!["vendor_food", "vendor_products", "admin"].includes(role)) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const body = (await req.json().catch(() => ({}))) as ReqBody;
    const orderIds = Array.from(new Set((body.orderIds ?? []).map((x) => String(x).trim()).filter(Boolean))).slice(0, 30);
    if (orderIds.length === 0) return NextResponse.json({ ok: true, buyersByOrderId: {} });

    const { data: orders, error: ordersErr } = await supabaseAdmin
      .from("orders")
      .select("id,customer_id")
      .eq("vendor_id", actorId)
      .in("id", orderIds);
    if (ordersErr) return NextResponse.json({ ok: false, error: ordersErr.message }, { status: 500 });

    const rows = (orders ?? []) as Array<{ id: string; customer_id: string }>;
    const customerIds = Array.from(new Set(rows.map((x) => String(x.customer_id || "").trim()).filter(Boolean)));

    const buyersByCustomerId = new Map<string, string>();
    if (customerIds.length > 0) {
      const { data: profiles } = await supabaseAdmin
        .from("profiles")
        .select("id,full_name")
        .in("id", customerIds);

      for (const row of (profiles ?? []) as Array<{ id: string; full_name: string | null }>) {
        const name = String(row.full_name ?? "").trim();
        if (name) buyersByCustomerId.set(row.id, name);
      }

      for (const customerId of customerIds) {
        if (buyersByCustomerId.has(customerId)) continue;
        const { data: userData } = await supabaseAdmin.auth.admin.getUserById(customerId);
        const email = String(userData.user?.email ?? "").trim();
        if (!email) continue;
        const fallback = email.split("@")[0]?.replace(/[._-]+/g, " ").trim();
        if (fallback) buyersByCustomerId.set(customerId, fallback);
      }
    }

    const buyersByOrderId: Record<string, string> = {};
    for (const order of rows) {
      const buyerName = buyersByCustomerId.get(order.customer_id) || "Buyer";
      buyersByOrderId[order.id] = buyerName;
    }

    return NextResponse.json({ ok: true, buyersByOrderId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

