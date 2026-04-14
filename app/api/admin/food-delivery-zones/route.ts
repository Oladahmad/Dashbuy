import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { normalizeFoodVendorOrigin } from "@/lib/foodDeliveryMatrix";

function readBearerToken(req: NextRequest) {
  const h = req.headers.get("authorization") || "";
  const [scheme, token] = h.split(" ");
  if (scheme?.toLowerCase() === "bearer" && token) return token.trim();
  return "";
}

async function requireAdmin(token: string) {
  const { data: authData, error: authErr } = await supabaseAdmin.auth.getUser(token);
  if (authErr || !authData.user) {
    return { ok: false as const, response: NextResponse.json({ ok: false, error: "Invalid session" }, { status: 401 }) };
  }

  const actorId = authData.user.id;
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("id", actorId)
    .maybeSingle<{ role: string }>();

  if ((profile?.role ?? "") !== "admin") {
    return { ok: false as const, response: NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 }) };
  }

  return { ok: true as const };
}

export async function GET(req: NextRequest) {
  try {
    const token = readBearerToken(req);
    if (!token) return NextResponse.json({ ok: false, error: "Missing token" }, { status: 401 });

    const auth = await requireAdmin(token);
    if (!auth.ok) return auth.response;

    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select("id,full_name,store_name,food_delivery_origin")
      .eq("role", "vendor_food")
      .order("store_name", { ascending: true });

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    const items = ((data ?? []) as Array<{ id: string; full_name: string | null; store_name: string | null; food_delivery_origin: string | null }>).map((row) => ({
      id: row.id,
      name: String(row.store_name ?? "").trim() || String(row.full_name ?? "").trim() || "Food vendor",
      food_delivery_origin: normalizeFoodVendorOrigin(row.food_delivery_origin) ?? null,
    }));

    return NextResponse.json({ ok: true, items });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Unexpected error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const token = readBearerToken(req);
    if (!token) return NextResponse.json({ ok: false, error: "Missing token" }, { status: 401 });

    const auth = await requireAdmin(token);
    if (!auth.ok) return auth.response;

    const body = (await req.json().catch(() => null)) as { vendorId?: string; foodDeliveryOrigin?: string | null } | null;
    const vendorId = String(body?.vendorId ?? "").trim();
    const normalizedOrigin = body?.foodDeliveryOrigin == null || body.foodDeliveryOrigin === ""
      ? null
      : normalizeFoodVendorOrigin(body.foodDeliveryOrigin);

    if (!vendorId) {
      return NextResponse.json({ ok: false, error: "Missing vendorId" }, { status: 400 });
    }
    if (body?.foodDeliveryOrigin && !normalizedOrigin) {
      return NextResponse.json({ ok: false, error: "Invalid delivery origin" }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ food_delivery_origin: normalizedOrigin })
      .eq("id", vendorId)
      .eq("role", "vendor_food");

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, foodDeliveryOrigin: normalizedOrigin });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Unexpected error" }, { status: 500 });
  }
}
