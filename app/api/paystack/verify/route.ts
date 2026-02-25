import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { notifyOrderEvent } from "@/lib/orderNotifications";

export async function POST(req: Request) {
  try {
    const { reference } = await req.json();

    if (!reference) {
      return NextResponse.json(
        { ok: false, error: "Missing reference" },
        { status: 400 }
      );
    }

    const secret = process.env.PAYSTACK_SECRET_KEY;
    if (!secret) {
      return NextResponse.json(
        { ok: false, error: "PAYSTACK_SECRET_KEY missing in .env.local" },
        { status: 500 }
      );
    }

    const res = await fetch(
      `https://api.paystack.co/transaction/verify/${reference}`,
      { headers: { Authorization: `Bearer ${secret}` } }
    );

    const data = await res.json();

    if (!data?.status) {
      return NextResponse.json(
        { ok: false, error: data?.message ?? "Verify failed" },
        { status: 400 }
      );
    }

    const paystackStatus = String(data?.data?.status ?? "");
    const amountKobo = Number(data?.data?.amount ?? 0);
    const currency = String(data?.data?.currency ?? "");
    const paidAt = data?.data?.paid_at ?? null;
    const ref = String(data?.data?.reference ?? reference);

    if (paystackStatus === "success") {
      const orderIdFromMeta = data?.data?.metadata?.orderId
        ? String(data.data.metadata.orderId)
        : null;

      const updatePayload = {
        status: "pending_vendor",
        paystack_reference: ref,
        total_amount: Math.round(amountKobo / 100),
      };

      let updatedOrder:
        | {
            id: string;
            status: string | null;
            vendor_id: string;
            customer_id: string;
            order_type: string;
            food_mode: string | null;
            total_amount: number | null;
            delivery_address: string | null;
            customer_phone: string | null;
            created_at: string;
          }
        | null = null;

      const byRef = await supabaseAdmin
        .from("orders")
        .update(updatePayload)
        .eq("paystack_reference", ref)
        .select(
          "id,status,vendor_id,customer_id,order_type,food_mode,total_amount,delivery_address,customer_phone,created_at"
        )
        .maybeSingle();

      if (byRef.error) {
        return NextResponse.json(
          { ok: false, error: "DB update error: " + byRef.error.message },
          { status: 500 }
        );
      }

      updatedOrder = byRef.data ?? null;

      if (!updatedOrder && orderIdFromMeta) {
        const byId = await supabaseAdmin
          .from("orders")
          .update(updatePayload)
          .eq("id", orderIdFromMeta)
          .select(
            "id,status,vendor_id,customer_id,order_type,food_mode,total_amount,delivery_address,customer_phone,created_at"
          )
          .maybeSingle();

        if (byId.error) {
          return NextResponse.json(
            { ok: false, error: "DB update error: " + byId.error.message },
            { status: 500 }
          );
        }

        updatedOrder = byId.data ?? null;
      }

      if (!updatedOrder) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "Order not found for this payment. Ensure paystack_reference is saved on orders during initialize, or metadata.orderId exists.",
          },
          { status: 404 }
        );
      }
      await notifyOrderEvent({
        event: "order_paid",
        orderId: updatedOrder.id,
        vendorId: updatedOrder.vendor_id,
        customerId: updatedOrder.customer_id,
        amountNaira: updatedOrder.total_amount,
        orderType: updatedOrder.order_type,
      });

      return NextResponse.json({
        ok: true,
        status: paystackStatus,
        amount: amountKobo,
        currency,
        paidAt,
        reference: ref,
        order: updatedOrder,
      });
    }

    return NextResponse.json({
      ok: true,
      status: paystackStatus,
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
