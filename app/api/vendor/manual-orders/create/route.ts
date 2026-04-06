import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { buildManualLogisticsNotes } from "@/lib/manualLogistics";

type Body = {
  customerName?: string;
  customerPhone?: string;
  deliveryAddress?: string;
  itemsText?: string;
  total?: number;
  riderMapUrl?: string;
};

function readBearerToken(req: NextRequest) {
  const h = req.headers.get("authorization") || "";
  const parts = h.split(" ");
  if (parts.length === 2 && parts[0].toLowerCase() === "bearer" && parts[1]) return parts[1].trim();
  return "";
}

function clean(v: unknown) {
  return String(v ?? "").trim();
}

function n(v: unknown) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
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
    const customerName = clean(body.customerName);
    const customerPhone = clean(body.customerPhone);
    const deliveryAddress = clean(body.deliveryAddress);
    const itemsText = clean(body.itemsText);
    const riderMapUrl = clean(body.riderMapUrl);
    const total = Math.max(0, Math.round(n(body.total)));

    if (!customerName) return NextResponse.json({ ok: false, error: "Customer name is required" }, { status: 400 });
    if (!customerPhone) return NextResponse.json({ ok: false, error: "Customer phone is required" }, { status: 400 });
    if (!deliveryAddress) return NextResponse.json({ ok: false, error: "Delivery address is required" }, { status: 400 });
    if (!itemsText) return NextResponse.json({ ok: false, error: "Ordered items are required" }, { status: 400 });
    if (total <= 0) return NextResponse.json({ ok: false, error: "Total must be greater than zero" }, { status: 400 });
    if (riderMapUrl && !/^https?:\/\//i.test(riderMapUrl)) {
      return NextResponse.json({ ok: false, error: "Rider map link must start with http:// or https://" }, { status: 400 });
    }

    const itemNames = itemsText
      .split(/[\n,]/)
      .map((x) => x.trim())
      .filter(Boolean)
      .slice(0, 3);
    const orderName = itemNames.length > 0 ? itemNames.join(", ") : "Manual customer order";
    const notes = buildManualLogisticsNotes(`Order name: ${orderName}`, customerName, itemsText, riderMapUrl, "vendor");

    const { data: order, error: orderErr } = await supabaseAdmin
      .from("orders")
      .insert({
        order_type: "product",
        food_mode: null,
        customer_id: actorId,
        vendor_id: actorId,
        status: "pending_vendor",
        subtotal: total,
        delivery_fee: 0,
        total,
        total_amount: total,
        delivery_address: deliveryAddress,
        delivery_address_source: "manual",
        customer_phone: customerPhone,
        notes,
      })
      .select("id")
      .single();

    if (orderErr || !order) {
      return NextResponse.json({ ok: false, error: orderErr?.message ?? "Failed to create order" }, { status: 500 });
    }

    const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "";
    const proto = req.headers.get("x-forwarded-proto") || "https";
    const base =
      process.env.NEXT_PUBLIC_TRACKING_BASE_URL?.trim() ||
      process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
      (host ? `${proto}://${host}` : "");
    const link = `${base.replace(/\/$/, "")}/track/${order.id}`;

    return NextResponse.json({ ok: true, orderId: order.id, link });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unexpected error" },
      { status: 500 }
    );
  }
}
