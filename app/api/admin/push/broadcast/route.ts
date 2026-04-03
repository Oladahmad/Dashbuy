import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { sendPushToUser } from "@/lib/pushNotifications";

type Audience =
  | "all"
  | "customers"
  | "vendors"
  | "vendor_food"
  | "vendor_products"
  | "logistics";

type Body = {
  title?: string;
  body?: string;
  audience?: Audience;
  url?: string;
};

function readBearerToken(req: Request) {
  const h = req.headers.get("authorization") || "";
  const [scheme, token] = h.split(" ");
  if (scheme?.toLowerCase() === "bearer" && token) return token.trim();
  return "";
}

function normalizeAudience(raw: string): Audience {
  if (raw === "customers") return "customers";
  if (raw === "vendors") return "vendors";
  if (raw === "vendor_food") return "vendor_food";
  if (raw === "vendor_products") return "vendor_products";
  if (raw === "logistics") return "logistics";
  return "all";
}

function rolesForAudience(audience: Audience) {
  if (audience === "customers") return ["customer"];
  if (audience === "vendors") return ["vendor_food", "vendor_products"];
  if (audience === "vendor_food") return ["vendor_food"];
  if (audience === "vendor_products") return ["vendor_products"];
  if (audience === "logistics") return ["logistics"];
  return ["customer", "vendor_food", "vendor_products", "logistics", "admin"];
}

function normalizeUrl(url: string) {
  const trimmed = String(url ?? "").trim();
  if (!trimmed) return "/";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith("/")) return trimmed;
  return `/${trimmed}`;
}

export async function POST(req: Request) {
  try {
    const token = readBearerToken(req);
    if (!token) return NextResponse.json({ ok: false, error: "Missing token" }, { status: 401 });

    const { data: authData, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !authData.user) {
      return NextResponse.json({ ok: false, error: "Invalid session" }, { status: 401 });
    }

    const actorId = authData.user.id;
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", actorId)
      .maybeSingle<{ role: string }>();
    if ((profile?.role ?? "") !== "admin") {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const body = ((await req.json().catch(() => null)) ?? {}) as Body;
    const title = String(body.title ?? "").trim();
    const message = String(body.body ?? "").trim();
    const audience = normalizeAudience(String(body.audience ?? "all").trim());
    const url = normalizeUrl(String(body.url ?? "").trim());

    if (!title) return NextResponse.json({ ok: false, error: "Title is required" }, { status: 400 });
    if (!message) return NextResponse.json({ ok: false, error: "Message body is required" }, { status: 400 });

    const roles = rolesForAudience(audience);
    const { data: users, error: usersErr } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .in("role", roles);

    if (usersErr) return NextResponse.json({ ok: false, error: usersErr.message }, { status: 500 });
    const ids = Array.from(new Set(((users ?? []) as Array<{ id: string }>).map((x) => x.id).filter(Boolean)));

    if (ids.length === 0) {
      return NextResponse.json({
        ok: true,
        sentToUsers: 0,
        message: "No users matched the selected audience.",
      });
    }

    for (let i = 0; i < ids.length; i += 20) {
      const chunk = ids.slice(i, i + 20);
      await Promise.all(
        chunk.map((userId) =>
          sendPushToUser(userId, {
            title,
            body: message,
            url,
            tag: `admin-broadcast-${Date.now()}`,
          })
        )
      );
    }

    return NextResponse.json({
      ok: true,
      sentToUsers: ids.length,
      audience,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unexpected error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

