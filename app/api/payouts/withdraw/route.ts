import { NextResponse } from "next/server";
import { payoutSummaryForActor, requireActor } from "@/app/api/payouts/_lib";

type Body = {
  amount?: number;
  bankCode?: string;
  bankName?: string;
  accountNumber?: string;
  accountName?: string;
};

function asText(x: unknown) {
  return typeof x === "string" ? x : x == null ? "" : String(x);
}

function asNumber(x: unknown) {
  if (typeof x === "number" && Number.isFinite(x)) return x;
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

function toKobo(naira: number) {
  return Math.round(naira * 100);
}

function payoutRef(actorId: string) {
  return `dashbuy_payout_${actorId.slice(0, 8)}_${Date.now()}`;
}

export async function POST(req: Request) {
  try {
    const auth = await requireActor(req);
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const isVendor = auth.role === "vendor_food" || auth.role === "vendor_products" || auth.role === "admin";
    const isLogistics = auth.role === "logistics" || auth.role === "admin";
    if (!isVendor && !isLogistics) {
      return NextResponse.json({ ok: false, error: "Not authorized for payouts" }, { status: 403 });
    }

    const body = (await req.json()) as Body;
    const amount = Math.floor(asNumber(body.amount));
    const bankCode = asText(body.bankCode).trim();
    const bankName = asText(body.bankName).trim();
    const accountNumber = asText(body.accountNumber).trim();
    const accountName = asText(body.accountName).trim();

    if (!amount || amount <= 0) {
      return NextResponse.json({ ok: false, error: "Invalid amount" }, { status: 400 });
    }
    if (!bankCode || !bankName || !accountNumber || !accountName) {
      return NextResponse.json(
        { ok: false, error: "Missing bank details (bankCode, bankName, accountNumber, accountName)" },
        { status: 400 }
      );
    }

    const summary = await payoutSummaryForActor(auth.actorId, auth.role);
    if (amount > summary.withdrawable) {
      return NextResponse.json(
        { ok: false, error: `Amount exceeds withdrawable balance (${summary.withdrawable})` },
        { status: 400 }
      );
    }

    const secret = process.env.PAYSTACK_SECRET_KEY;
    if (!secret) {
      return NextResponse.json({ ok: false, error: "PAYSTACK_SECRET_KEY missing in env" }, { status: 500 });
    }

    const reference = payoutRef(auth.actorId);

    const recipientRes = await fetch("https://api.paystack.co/transferrecipient", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        type: "nuban",
        name: accountName,
        account_number: accountNumber,
        bank_code: bankCode,
        currency: "NGN",
      }),
    });

    const recipientJson = await recipientRes.json();
    if (!recipientRes.ok || !recipientJson?.status) {
      return NextResponse.json(
        { ok: false, error: recipientJson?.message ?? "Failed to create transfer recipient" },
        { status: 400 }
      );
    }

    const recipientCode = asText(recipientJson?.data?.recipient_code).trim();
    if (!recipientCode) {
      return NextResponse.json({ ok: false, error: "Recipient code missing" }, { status: 400 });
    }

    const transferRes = await fetch("https://api.paystack.co/transfer", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        source: "balance",
        amount: toKobo(amount),
        recipient: recipientCode,
        reason: "Dashbuy earnings withdrawal",
        reference,
      }),
    });

    const transferJson = await transferRes.json();
    if (!transferRes.ok || !transferJson?.status) {
      return NextResponse.json(
        { ok: false, error: transferJson?.message ?? "Transfer failed" },
        { status: 400 }
      );
    }

    const transferCode = asText(transferJson?.data?.transfer_code).trim();
    const refOut = transferCode || reference;

    const { error: savePayoutErr } = await auth.admin.from("vendor_payouts").insert({
      vendor_id: auth.actorId,
      amount,
      reference: refOut,
      type: "manual_withdrawal",
      status: "successful",
      bank_name: bankName,
      bank_code: bankCode,
      account_number: accountNumber,
      squad_transfer_reference: refOut,
    });

    if (savePayoutErr) {
      return NextResponse.json({ ok: false, error: "Payout save error: " + savePayoutErr.message }, { status: 500 });
    }

    const { error: saveBankErr } = await auth.admin
      .from("profiles")
      .update({
        bank_name: bankName,
        bank_account_number: accountNumber,
        bank_account_name: accountName,
      })
      .eq("id", auth.actorId);

    if (saveBankErr) {
      return NextResponse.json({ ok: false, error: "Bank details save error: " + saveBankErr.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      message: "Withdrawal transfer initiated",
      amount,
      reference: refOut,
      remaining: Math.max(0, summary.withdrawable - amount),
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
