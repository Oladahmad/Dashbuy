import { NextResponse } from "next/server";

type Body = {
  bankCode?: string;
  accountNumber?: string;
};

function asText(x: unknown) {
  return typeof x === "string" ? x : x == null ? "" : String(x);
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;
    const bankCode = asText(body.bankCode).trim();
    const accountNumber = asText(body.accountNumber).trim();

    if (!bankCode || !accountNumber) {
      return NextResponse.json({ ok: false, error: "Missing bankCode or accountNumber" }, { status: 400 });
    }

    const secret = process.env.PAYSTACK_SECRET_KEY;
    if (!secret) {
      return NextResponse.json({ ok: false, error: "PAYSTACK_SECRET_KEY missing in env" }, { status: 500 });
    }

    const url = `https://api.paystack.co/bank/resolve?account_number=${encodeURIComponent(accountNumber)}&bank_code=${encodeURIComponent(bankCode)}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${secret}` },
      cache: "no-store",
    });

    const json = await res.json();
    if (!res.ok || !json?.status) {
      return NextResponse.json(
        { ok: false, error: json?.message ?? "Account resolve failed" },
        { status: 400 }
      );
    }

    const accountName = String(json?.data?.account_name ?? "").trim();
    if (!accountName) {
      return NextResponse.json({ ok: false, error: "Could not resolve account name" }, { status: 400 });
    }

    return NextResponse.json({ ok: true, accountName });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
