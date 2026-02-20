import { NextResponse } from "next/server";
import { payoutSummaryForActor, requireActor } from "@/app/api/payouts/_lib";

export async function GET(req: Request) {
  try {
    const auth = await requireActor(req);
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const summary = await payoutSummaryForActor(auth.actorId, auth.role);
    return NextResponse.json({ ok: true, ...summary });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
