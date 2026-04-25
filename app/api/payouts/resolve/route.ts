import { NextResponse } from "next/server";
import { paystackResolveAccount } from "@/lib/paystack";

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

    const lookup = await paystackResolveAccount(bankCode, accountNumber);
    if (!lookup.ok) {
      return NextResponse.json(
        { ok: false, error: lookup.json?.message ?? "Account resolve failed" },
        { status: 400 }
      );
    }

    const accountName = String(lookup.json?.data?.account_name ?? "").trim();
    if (!accountName) {
      return NextResponse.json({ ok: false, error: "Could not resolve account name" }, { status: 400 });
    }

    return NextResponse.json({ ok: true, accountName });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
