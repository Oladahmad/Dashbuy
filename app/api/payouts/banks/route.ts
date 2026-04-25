import { NextResponse } from "next/server";
import { paystackListBanks } from "@/lib/paystack";

export async function GET() {
  try {
    const response = await paystackListBanks();
    if (!response.ok) {
      return NextResponse.json({ ok: false, error: response.json?.message ?? "Unable to load banks", banks: [] }, { status: 400 });
    }

    const banks = (response.json?.data ?? [])
      .filter((b) => b?.name && b?.code && (b.active ?? true))
      .map((b) => ({ name: String(b.name), code: String(b.code) }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json({ ok: true, banks });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ ok: false, error: msg, banks: [] }, { status: 500 });
  }
}
