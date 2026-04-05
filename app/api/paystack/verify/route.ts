import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { notifyOrderEvent } from "@/lib/orderNotifications";
import { squadVerifyTransaction } from "@/lib/squad";

type PaidOrder = {
  id: string;
  status: string | null;
  vendor_id: string;
  customer_id: string;
  order_type: string;
  food_mode: string | null;
  total: number | null;
  total_amount: number | null;
  delivery_address: string | null;
  customer_phone: string | null;
  created_at: string;
};

export async function POST(req: Request) {
  try {
    const { reference } = await req.json();

    if (!reference) {
      return NextResponse.json(
        { ok: false, error: "Missing reference" },
        { status: 400 }
      );
    }

    const secret = process.env.SQUAD_SECRET_KEY;
    if (!secret) {
      return NextResponse.json(
        { ok: false, error: "SQUAD_SECRET_KEY missing in .env.local" },
        { status: 500 }
      );
    }

    const verification = await squadVerifyTransaction(reference);
    const data = verification.json;

    if (!verification.ok || !data?.success) {
      return NextResponse.json(
        { ok: false, error: data?.message ?? "Verify failed" },
        { status: 400 }
      );
    }

    const paymentStatus = String(data?.data?.transaction_status ?? "");
    const normalizedPaymentStatus = paymentStatus.trim().toLowerCase();
    const amountKobo = Number(data?.data?.transaction_amount ?? 0);
    const currency = String(data?.data?.transaction_currency_id ?? "NGN");
    const paidAt = data?.data?.created_at ?? null;
    const ref = String(data?.data?.transaction_ref ?? reference);

    if (normalizedPaymentStatus === "success" || normalizedPaymentStatus === "successful") {
      const updatePayload = {
        status: "pending_vendor",
        paystack_reference: ref,
      };

      let targetOrders: PaidOrder[] = [];

      const byRefLookup = await supabaseAdmin
        .from("orders")
        .select(
          "id,status,vendor_id,customer_id,order_type,food_mode,total,total_amount,delivery_address,customer_phone,created_at"
        )
        .eq("paystack_reference", ref);

      if (byRefLookup.error) {
        return NextResponse.json({ ok: false, error: "Order lookup error: " + byRefLookup.error.message }, { status: 500 });
      }

      targetOrders = (byRefLookup.data as PaidOrder[] | null) ?? [];

      if (targetOrders.length === 0) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "Order not found for this payment reference.",
          },
          { status: 404 }
        );
      }

      const pendingOrderIds = targetOrders.filter((order) => order.status === "pending_payment").map((order) => order.id);

      if (pendingOrderIds.length > 0) {
        const updateRes = await supabaseAdmin
          .from("orders")
          .update(updatePayload)
          .in("id", pendingOrderIds);

        if (updateRes.error) {
          return NextResponse.json({ ok: false, error: "DB update error: " + updateRes.error.message }, { status: 500 });
        }
      }

      const refreshed = await supabaseAdmin
        .from("orders")
        .select(
          "id,status,vendor_id,customer_id,order_type,food_mode,total,total_amount,delivery_address,customer_phone,created_at"
        )
        .in(
          "id",
          targetOrders.map((order) => order.id)
        );

      if (refreshed.error) {
        return NextResponse.json({ ok: false, error: "Order reload error: " + refreshed.error.message }, { status: 500 });
      }

      const updatedOrders = ((refreshed.data as PaidOrder[] | null) ?? []).sort((a, b) => a.created_at.localeCompare(b.created_at));
      const justPaidOrders = updatedOrders.filter((order) => pendingOrderIds.includes(order.id));

      await Promise.allSettled(
        justPaidOrders.map((order) =>
          notifyOrderEvent({
            event: "order_paid",
            orderId: order.id,
            vendorId: order.vendor_id,
            customerId: order.customer_id,
            amountNaira: order.total_amount ?? order.total,
            orderType: order.order_type,
          })
        )
      );

      return NextResponse.json({
        ok: true,
        status: paymentStatus,
        amount: amountKobo,
        currency,
        paidAt,
        reference: ref,
        orders: updatedOrders,
        notifiedOrderIds: justPaidOrders.map((order) => order.id),
      });
    }

    return NextResponse.json({
      ok: true,
      status: paymentStatus,
      amount: amountKobo,
      currency,
      paidAt,
      reference: ref,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
