import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type PushSubscriptionBody = {
  endpoint?: string;
  keys?: {
    p256dh?: string;
    auth?: string;
  };
};

function adminClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false } });
}

function anonClient() {
  const url = process.env.SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) throw new Error("Missing SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
  return createClient(url, anon, { auth: { persistSession: false } });
}

function readBearerToken(req: Request) {
  const h = req.headers.get("authorization") || "";
  const parts = h.split(" ");
  if (parts.length === 2 && parts[0].toLowerCase() === "bearer" && parts[1]) return parts[1].trim();
  return "";
}

async function authUser(req: Request) {
  const token = readBearerToken(req);
  if (!token) return { ok: false as const, error: "Missing Authorization Bearer token", status: 401 };

  const anon = anonClient();
  const { data, error } = await anon.auth.getUser(token);
  if (error || !data?.user) return { ok: false as const, error: "Not signed in", status: 401 };
  return { ok: true as const, userId: data.user.id };
}

function parseSubscription(raw: unknown) {
  const body = (raw ?? {}) as PushSubscriptionBody;
  const endpoint = String(body.endpoint ?? "").trim();
  const p256dh = String(body.keys?.p256dh ?? "").trim();
  const auth = String(body.keys?.auth ?? "").trim();
  if (!endpoint || !p256dh || !auth) return null;
  return { endpoint, p256dh, auth };
}

export async function POST(req: Request) {
  try {
    const auth = await authUser(req);
    if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

    const parsed = parseSubscription(await req.json().catch(() => null));
    if (!parsed) {
      return NextResponse.json({ ok: false, error: "Invalid push subscription payload" }, { status: 400 });
    }

    const a = adminClient();
    const { error } = await a.from("push_subscriptions").upsert(
      {
        user_id: auth.userId,
        endpoint: parsed.endpoint,
        p256dh: parsed.p256dh,
        auth: parsed.auth,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "endpoint" }
    );

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const auth = await authUser(req);
    if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

    const parsed = parseSubscription(await req.json().catch(() => null));
    if (!parsed) {
      return NextResponse.json({ ok: false, error: "Invalid push subscription payload" }, { status: 400 });
    }

    const a = adminClient();
    const { error } = await a
      .from("push_subscriptions")
      .delete()
      .eq("user_id", auth.userId)
      .eq("endpoint", parsed.endpoint);

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

