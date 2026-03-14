import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type Body = {
  orderId?: string;
  orderIds?: string[];
  email: string;
};

function nairaToKobo(n: number) {
  return Math.round(Number(n) * 100);
}

function asText(x: unknown) {
  return typeof x === "string" ? x : x == null ? "" : String(x);
}

function asNumber(x: unknown) {
  if (typeof x === "number" && Number.isFinite(x)) return x;
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

function genRef(orderId: string) {
  return `dashbuy_${orderId}_${Date.now()}`;
}

function isLocalUrl(url: string) {
  const lower = url.toLowerCase();
  return lower.includes("localhost") || lower.includes("127.0.0.1");
}

function trimTrailingSlash(url: string) {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Partial<Body>;
    const orderId = asText(body.orderId).trim();
    const orderIds = Array.isArray(body.orderIds)
      ? body.orderIds.map((id) => asText(id).trim()).filter(Boolean)
      : [];
    const email = asText(body.email).trim();
    const requestedOrderIds = Array.from(new Set(orderId ? [orderId, ...orderIds] : orderIds));

    if (requestedOrderIds.length === 0 || !email) {
      return NextResponse.json({ ok: false, error: "Missing orderId or email" }, { status: 400 });
    }

    const secret = process.env.PAYSTACK_SECRET_KEY;
    if (!secret) {
      return NextResponse.json({ ok: false, error: "PAYSTACK_SECRET_KEY missing in env" }, { status: 500 });
    }

    const { data: orders, error: orderErr } = await supabaseAdmin
      .from("orders")
      .select("id,total,status,paystack_reference,customer_id")
      .in("id", requestedOrderIds);

    if (orderErr) {
      return NextResponse.json({ ok: false, error: "Order lookup error: " + orderErr.message }, { status: 500 });
    }

    if (!orders || orders.length !== requestedOrderIds.length) {
      return NextResponse.json({ ok: false, error: "One or more orders were not found" }, { status: 404 });
    }

    if (orders.some((order) => order.status !== "pending_payment")) {
      return NextResponse.json({ ok: false, error: "One or more orders are not pending payment" }, { status: 400 });
    }

    const customerIds = Array.from(new Set(orders.map((order) => asText(order.customer_id).trim()).filter(Boolean)));
    if (customerIds.length > 1) {
      return NextResponse.json({ ok: false, error: "Orders belong to different customers" }, { status: 400 });
    }

    const totalNaira = orders.reduce((sum, order) => sum + asNumber(order.total), 0);
    if (!totalNaira || totalNaira <= 0) {
      return NextResponse.json({ ok: false, error: "Order total is invalid" }, { status: 400 });
    }

    const amountKobo = nairaToKobo(totalNaira);

    const existingReference = orders
      .map((order) => asText(order.paystack_reference).trim())
      .find(Boolean);
    const reference = existingReference || genRef(requestedOrderIds[0]);

    const envBase = asText(process.env.NEXT_PUBLIC_SITE_URL).trim();
    const xfProto = asText(req.headers.get("x-forwarded-proto")).trim() || "https";
    const xfHost = asText(req.headers.get("x-forwarded-host")).trim();
    const host = xfHost || asText(req.headers.get("host")).trim();

    const inferredBase = host ? `${xfProto}://${host}` : "";
    const useEnvBase = envBase && !isLocalUrl(envBase);
    const baseUrl = trimTrailingSlash(useEnvBase ? envBase : inferredBase);

    if (!baseUrl) {
      return NextResponse.json(
        { ok: false, error: "Unable to resolve callback base URL. Set NEXT_PUBLIC_SITE_URL in Vercel env." },
        { status: 500 }
      );
    }

    const callbackUrl = `${baseUrl}/food/pay/callback`;

    if (orders.some((order) => asText(order.paystack_reference).trim() !== reference)) {
      const { error: saveRefErr } = await supabaseAdmin
        .from("orders")
        .update({ paystack_reference: reference })
        .in("id", requestedOrderIds);

      if (saveRefErr) {
        return NextResponse.json(
          { ok: false, error: "Failed to save paystack reference on order: " + saveRefErr.message },
          { status: 500 }
        );
      }
    }

    const resp = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email,
        amount: amountKobo,
        reference,
        callback_url: callbackUrl,
        metadata: {
          orderId: requestedOrderIds[0],
          orderIds: requestedOrderIds,
          type: "orders",
        },
      }),
    });

    const json = await resp.json();

    if (!resp.ok || !json?.status) {
      return NextResponse.json(
        { ok: false, error: json?.message ?? "Paystack init failed", raw: json },
        { status: 400 }
      );
    }

    const existingPayments = await supabaseAdmin
      .from("payments")
      .select("id")
      .eq("reference", reference)
      .limit(1);

    if (existingPayments.error) {
      return NextResponse.json({ ok: false, error: "Payment lookup failed: " + existingPayments.error.message }, { status: 500 });
    }

    if ((existingPayments.data ?? []).length === 0) {
      const { error: payErr } = await supabaseAdmin.from("payments").insert({
        order_id: requestedOrderIds[0],
        provider: "paystack",
        reference,
        amount: totalNaira,
        currency: "NGN",
        status: "initialized",
      });

      if (payErr) {
        return NextResponse.json({ ok: false, error: "Payment insert failed: " + payErr.message }, { status: 500 });
      }
    }

    return NextResponse.json({
      ok: true,
      authorization_url: json.data.authorization_url,
      reference,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
