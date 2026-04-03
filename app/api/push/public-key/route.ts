import { NextResponse } from "next/server";
import { isPushEnabled, pushPublicKey } from "@/lib/pushNotifications";

export async function GET() {
  if (!isPushEnabled()) {
    return NextResponse.json(
      { ok: false, error: "Push notifications not configured" },
      { status: 503 }
    );
  }

  const publicKey = pushPublicKey();
  if (!publicKey) {
    return NextResponse.json({ ok: false, error: "Missing VAPID public key" }, { status: 503 });
  }

  return NextResponse.json({ ok: true, publicKey });
}

