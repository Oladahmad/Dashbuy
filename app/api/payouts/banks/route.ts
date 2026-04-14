import { NextResponse } from "next/server";
import { SQUAD_BANKS } from "@/lib/squadBanks";

type BankRow = {
  name: string;
  code: string;
  active?: boolean;
};

export async function GET() {
  try {
    const banks = (SQUAD_BANKS as BankRow[])
      .filter((b) => b?.name && b?.code && (b.active ?? true))
      .map((b) => ({ name: String(b.name), code: String(b.code) }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json({ ok: true, banks });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ ok: false, error: msg, banks: [] }, { status: 500 });
  }
}
