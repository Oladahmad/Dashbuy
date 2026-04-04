import { NextResponse } from "next/server";
import crypto from "crypto";
import { creditWalletFromPaystack } from "@/lib/walletCredit";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { Resend } from "resend";

async function sendMismatchEmail(params: {
  kind: "order" | "wallet";
  expected: number;
  paid: number;
  reference: string;
}) {
  const resendKey = process.env.RESEND_API_KEY || "";
  const from = process.env.EMAIL_FROM || "";
  if (!resendKey || !from) return;
  const to = process.env.ADMIN_ALERT_EMAIL || "oladunjoyeahmad@gmail.com";
  const resend = new Resend(resendKey);
  const subject = `Dashbuy DVA mismatch (${params.kind})`;
  const html = `
    <div style="font-family:Segoe UI,Arial,sans-serif;background:#f6f6f6;padding:20px;">
      <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e5e5e5;border-radius:12px;padding:20px;">
        <h2 style="margin:0 0 12px;font-size:18px;">Payment mismatch detected</h2>
        <p style="margin:0 0 10px;font-size:14px;color:#333;">
          A dedicated account payment did not match the expected amount.
        </p>
        <div style="font-size:13px;line-height:1.6;color:#333;">
          <div><strong>Type:</strong> ${params.kind}</div>
          <div><strong>Expected:</strong> ₦${Math.round(params.expected).toLocaleString()}</div>
          <div><strong>Paid:</strong> ₦${Math.round(params.paid).toLocaleString()}</div>
          <div><strong>Reference:</strong> ${params.reference || "N/A"}</div>
        </div>
      </div>
    </div>
  `;
  const { error } = await resend.emails.send({
    from,
    to,
    subject,
    html,
  });
  if (error) {
    console.error("Resend mismatch email failed:", error);
  }
}

export async function POST(req: Request) {
  try {
    const secret = process.env.PAYSTACK_SECRET_KEY;
    if (!secret) {
      return NextResponse.json({ ok: false, error: "PAYSTACK_SECRET_KEY missing" }, { status: 500 });
    }

    const signature = req.headers.get("x-paystack-signature") || "";
    const rawBody = await req.text();
    const hash = crypto.createHmac("sha512", secret).update(rawBody).digest("hex");

    if (hash !== signature) {
      return NextResponse.json({ ok: false, error: "Invalid signature" }, { status: 401 });
    }

    const payload = JSON.parse(rawBody) as {
      event?: string;
      data?: {
        status?: string;
        amount?: number;
        reference?: string;
        metadata?: { type?: string; customerId?: string };
        customer?: { customer_code?: string };
      };
    };

    if (payload.event !== "charge.success") {
      return NextResponse.json({ ok: true, ignored: true });
    }

    const status = String(payload.data?.status ?? "");
    if (status !== "success") return NextResponse.json({ ok: true, ignored: true });

    const meta = payload.data?.metadata || {};
    const type = String(meta.type ?? "");
    const customerId = String(meta.customerId ?? "");
    const reference = String(payload.data?.reference ?? "");
    const amountKobo = Number(payload.data?.amount ?? 0);
    const amount = Math.floor(amountKobo / 100);

    if (type === "wallet_topup" && customerId && reference && amount > 0) {
      await creditWalletFromPaystack({ customerId, amount, reference });
      return NextResponse.json({ ok: true });
    }

    // Try to map as a dedicated account (DVA) payment for orders or wallet topup
    const customerCode = String(payload.data?.customer?.customer_code ?? "").trim();
    if (!customerCode || amount <= 0) return NextResponse.json({ ok: true, ignored: true });

    const { data: dvaRow } = await supabaseAdmin
      .from("order_dedicated_accounts")
      .select("id,order_ids,amount,status,customer_id")
      .eq("paystack_customer_code", customerCode)
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle<{
        id: string;
        order_ids: string[];
        amount: number;
        status: string;
        customer_id: string;
      }>();

    if (dvaRow && Number(dvaRow.amount ?? 0) === amount) {
      const orderIds = Array.isArray(dvaRow.order_ids) ? dvaRow.order_ids : [];
      if (orderIds.length > 0) {
        await supabaseAdmin
          .from("orders")
          .update({ status: "pending_vendor", paystack_reference: reference })
          .in("id", orderIds);
      }
      await supabaseAdmin
        .from("order_dedicated_accounts")
        .update({
          status: "paid",
          paystack_reference: reference,
          paid_at: new Date().toISOString(),
          last_paid_amount: amount,
          last_reference: reference,
        })
        .eq("id", dvaRow.id);
      return NextResponse.json({ ok: true });
    }
    if (dvaRow) {
      await supabaseAdmin
        .from("order_dedicated_accounts")
        .update({
          status: "mismatch",
          paystack_reference: reference,
          paid_at: new Date().toISOString(),
          last_paid_amount: amount,
          last_reference: reference,
        })
        .eq("id", dvaRow.id);
      await sendMismatchEmail({
        kind: "order",
        expected: Number(dvaRow.amount ?? 0),
        paid: amount,
        reference,
      });
      return NextResponse.json({ ok: true });
    }

    const { data: walletRow } = await supabaseAdmin
      .from("wallet_dedicated_accounts")
      .select("id,amount,status,customer_id")
      .eq("paystack_customer_code", customerCode)
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle<{
        id: string;
        amount: number;
        status: string;
        customer_id: string;
      }>();

    if (walletRow && Number(walletRow.amount ?? 0) === amount) {
      await creditWalletFromPaystack({ customerId: walletRow.customer_id, amount, reference });
      await supabaseAdmin
        .from("wallet_dedicated_accounts")
        .update({
          status: "paid",
          paystack_reference: reference,
          paid_at: new Date().toISOString(),
          last_paid_amount: amount,
          last_reference: reference,
        })
        .eq("id", walletRow.id);
      return NextResponse.json({ ok: true });
    }
    if (walletRow) {
      await supabaseAdmin
        .from("wallet_dedicated_accounts")
        .update({
          status: "mismatch",
          paystack_reference: reference,
          paid_at: new Date().toISOString(),
          last_paid_amount: amount,
          last_reference: reference,
        })
        .eq("id", walletRow.id);
      await sendMismatchEmail({
        kind: "wallet",
        expected: Number(walletRow.amount ?? 0),
        paid: amount,
        reference,
      });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: true, ignored: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
