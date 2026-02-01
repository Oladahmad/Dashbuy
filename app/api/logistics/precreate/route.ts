import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type Body = {
  orderId: string;
  deliveryAddress: string;
  customerPhone: string;
};

function asText(x: unknown) {
  return typeof x === "string" ? x : x == null ? "" : String(x);
}

function asNumber(x: unknown) {
  if (typeof x === "number" && Number.isFinite(x)) return x;
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Partial<Body>;

    const orderId = asText(body.orderId).trim();
    const deliveryAddress = asText(body.deliveryAddress).trim();
    const customerPhone = asText(body.customerPhone).trim();

    if (!orderId) return NextResponse.json({ ok: false, error: "Missing orderId" }, { status: 400 });
    if (!deliveryAddress) return NextResponse.json({ ok: false, error: "Missing deliveryAddress" }, { status: 400 });
    if (!customerPhone) return NextResponse.json({ ok: false, error: "Missing customerPhone" }, { status: 400 });

    const { data: order, error: oErr } = await supabaseAdmin
      .from("orders")
      .select("id,order_type,food_mode,customer_id,vendor_id,total,total_amount")
      .eq("id", orderId)
      .maybeSingle();

    if (oErr) {
      return NextResponse.json({ ok: false, error: "Order lookup error: " + oErr.message }, { status: 500 });
    }

    if (!order) {
      return NextResponse.json({ ok: false, error: "Order not found" }, { status: 404 });
    }

    const vendorId = asText(order.vendor_id);
    const customerId = asText(order.customer_id);

    const { data: vendorProfile, error: vErr } = await supabaseAdmin
      .from("profiles")
      .select("store_name,store_address,phone,full_name")
      .eq("id", vendorId)
      .maybeSingle();

    if (vErr) {
      return NextResponse.json({ ok: false, error: "Vendor profile error: " + vErr.message }, { status: 500 });
    }

    const { data: customerProfile, error: cErr } = await supabaseAdmin
      .from("profiles")
      .select("full_name")
      .eq("id", customerId)
      .maybeSingle();

    if (cErr) {
      return NextResponse.json({ ok: false, error: "Customer profile error: " + cErr.message }, { status: 500 });
    }

    const vendorName = asText(vendorProfile?.store_name || vendorProfile?.full_name || "Vendor");
    const vendorPhone = asText(vendorProfile?.phone || "");
    const vendorAddress = asText(vendorProfile?.store_address || "");

    const customerName = asText(customerProfile?.full_name || "Customer");

    const orderTotal = asNumber(order.total_amount ?? order.total);

    const { data: job, error: jErr } = await supabaseAdmin
      .from("logistics_jobs")
      .upsert(
        {
          order_id: orderId,
          vendor_id: vendorId,
          customer_id: customerId,

          vendor_name: vendorName,
          vendor_phone: vendorPhone,
          vendor_address: vendorAddress,

          customer_name: customerName,
          customer_phone: customerPhone,
          delivery_address: deliveryAddress,

          status: "pending_pickup",

          order_type: asText(order.order_type || ""),
          food_mode: order.food_mode == null ? null : asText(order.food_mode),
          order_total: orderTotal,
        },
        { onConflict: "order_id" }
      )
      .select("id,order_id,status")
      .maybeSingle();

    if (jErr) {
      return NextResponse.json({ ok: false, error: "Logistics job upsert error: " + jErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, job });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
