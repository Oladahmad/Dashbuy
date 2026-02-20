import { NextResponse } from "next/server";

type BankRow = {
  name: string;
  code: string;
  active?: boolean;
};

export async function GET() {
  try {
    const secret = process.env.PAYSTACK_SECRET_KEY;
    if (!secret) {
      return NextResponse.json({ ok: false, error: "PAYSTACK_SECRET_KEY missing in env", banks: [] }, { status: 500 });
    }

    const res = await fetch("https://api.paystack.co/bank?country=nigeria&perPage=200", {
      headers: { Authorization: `Bearer ${secret}` },
      cache: "no-store",
    });

    const json = await res.json();
    if (!res.ok || !json?.status) {
      return NextResponse.json(
        { ok: false, error: json?.message ?? "Failed to load banks", banks: [] },
        { status: 400 }
      );
    }

    const banks = ((json.data ?? []) as BankRow[])
      .filter((b) => b?.name && b?.code && (b.active ?? true))
      .map((b) => ({ name: String(b.name), code: String(b.code) }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json({ ok: true, banks });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ ok: false, error: msg, banks: [] }, { status: 500 });
  }
}
