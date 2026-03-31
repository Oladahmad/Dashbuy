import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type ReqBody = {
  orderId?: string;
};

type Role = "customer" | "vendor_food" | "vendor_products" | "logistics" | "admin";

function readBearerToken(req: Request) {
  const h = req.headers.get("authorization") || "";
  const [scheme, token] = h.split(" ");
  if (scheme?.toLowerCase() === "bearer" && token) return token.trim();
  return "";
}

type Row = Record<string, unknown>;

function safeNumber(x: unknown, fallback = 0) {
  if (typeof x === "number" && Number.isFinite(x)) return x;
  const n = Number(x);
  return Number.isFinite(n) ? n : fallback;
}

function pickRelObject<T extends Row>(value: unknown): T | null {
  if (Array.isArray(value)) {
    const first = value[0];
    return first && typeof first === "object" ? (first as T) : null;
  }
  if (value && typeof value === "object") return value as T;
  return null;
}

function toPublicUrl(bucket: "product-images" | "food-images", pathOrUrl: string | null | undefined) {
  const raw = String(pathOrUrl ?? "").trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  const { data } = supabaseAdmin.storage.from(bucket).getPublicUrl(raw);
  return data.publicUrl || null;
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
      .maybeSingle<{ id: string; role: Role }>();
    const role = (actorProfile?.role ?? "customer") as Role;

    const body = (await req.json().catch(() => ({}))) as ReqBody;
    const orderId = String(body.orderId ?? "").trim();
    if (!orderId) return NextResponse.json({ ok: false, error: "Missing orderId" }, { status: 400 });

    const { data: order, error: orderErr } = await supabaseAdmin
      .from("orders")
      .select("id,order_type,food_mode,customer_id,vendor_id,subtotal,delivery_fee,total,total_amount,status")
      .eq("id", orderId)
      .maybeSingle<{
        id: string;
        order_type: "food" | "product";
        food_mode: "plate" | "combo" | null;
        customer_id: string;
        vendor_id: string;
        subtotal: number | null;
        delivery_fee: number | null;
        total: number | null;
        total_amount: number | null;
        status: string | null;
      }>();
    if (orderErr || !order) return NextResponse.json({ ok: false, error: "Order not found" }, { status: 404 });

    const allowed =
      role === "admin" ||
      role === "logistics" ||
      order.customer_id === actorId ||
      (role === "vendor_food" && order.vendor_id === actorId) ||
      (role === "vendor_products" && order.vendor_id === actorId);
    if (!allowed) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

    const items: Array<{
      id: string;
      kind: "product" | "combo" | "plate";
      name: string;
      qty: number;
      unitPrice: number;
      lineTotal: number;
      variantName: string | null;
      imageUrl: string | null;
    }> = [];

    if (order.order_type === "product") {
      const { data: rows } = await supabaseAdmin
        .from("order_items")
        .select("id,qty,unit_price,line_total,products:product_id(name,image_path)")
        .eq("order_id", order.id);
      for (const row of (rows ?? []) as Row[]) {
        const product = pickRelObject<{ name?: string | null; image_path?: string | null }>(row.products);
        const qty = Math.max(1, safeNumber(row.qty, 1));
        const unit = safeNumber(row.unit_price, 0);
        const line = safeNumber(row.line_total, qty * unit);
        items.push({
          id: String(row.id ?? ""),
          kind: "product",
          name: String(product?.name ?? "Product"),
          qty,
          unitPrice: unit,
          lineTotal: line,
          variantName: null,
          imageUrl: toPublicUrl("product-images", product?.image_path ?? null),
        });
      }
    } else {
      const { data: comboRows } = await supabaseAdmin
        .from("combo_order_items")
        .select("id,qty,unit_price,line_total,food_items:combo_food_id(name,image_url)")
        .eq("order_id", order.id);
      for (const row of (comboRows ?? []) as Row[]) {
        const food = pickRelObject<{ name?: string | null; image_url?: string | null }>(row.food_items);
        const qty = Math.max(1, safeNumber(row.qty, 1));
        const unit = safeNumber(row.unit_price, 0);
        const line = safeNumber(row.line_total, qty * unit);
        items.push({
          id: `combo-${String(row.id ?? "")}`,
          kind: "combo",
          name: String(food?.name ?? "Combo"),
          qty,
          unitPrice: unit,
          lineTotal: line,
          variantName: null,
          imageUrl: toPublicUrl("food-images", food?.image_url ?? null),
        });
      }

      const { data: plateRows } = await supabaseAdmin.from("order_plates").select("id").eq("order_id", order.id);
      const plateIds = ((plateRows ?? []) as Array<{ id: string }>).map((p) => p.id);
      if (plateIds.length > 0) {
        const { data: rows } = await supabaseAdmin
          .from("order_plate_items")
          .select("id,qty,unit_price,line_total,food_items:food_item_id(name,image_url),food_item_variants:variant_id(name)")
          .in("order_plate_id", plateIds);
        for (const row of (rows ?? []) as Row[]) {
          const food = pickRelObject<{ name?: string | null; image_url?: string | null }>(row.food_items);
          const variant = pickRelObject<{ name?: string | null }>(row.food_item_variants);
          const qty = Math.max(1, safeNumber(row.qty, 1));
          const unit = safeNumber(row.unit_price, 0);
          const line = safeNumber(row.line_total, qty * unit);
          items.push({
            id: `plate-${String(row.id ?? "")}`,
            kind: "plate",
            name: String(food?.name ?? "Food item"),
            qty,
            unitPrice: unit,
            lineTotal: line,
            variantName: variant?.name ?? null,
            imageUrl: toPublicUrl("food-images", food?.image_url ?? null),
          });
        }
      }
    }

    return NextResponse.json({
      ok: true,
      order: {
        id: order.id,
        order_type: order.order_type,
        food_mode: order.food_mode,
        status: order.status,
        subtotal: safeNumber(order.subtotal, 0),
        delivery_fee: safeNumber(order.delivery_fee, 0),
        total: safeNumber(order.total_amount ?? order.total, 0),
      },
      items,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
