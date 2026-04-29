import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { parseManualLogisticsNotes, stripLogisticsMeta } from "@/lib/manualLogistics";

type JobStatus = "pending_pickup" | "picked_up" | "delivered" | "cancelled";

type LogisticsJobRow = {
  id: string;
  order_id: string;
  vendor_id: string;
  customer_id: string;
  status: JobStatus;
  created_at: string;
  updated_at?: string;
  vendor_name: string | null;
  vendor_phone: string | null;
  vendor_address: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  delivery_address: string | null;
  order_type: string | null;
  food_mode: string | null;
  order_total: number | null;
  customer_lat?: number | null;
  customer_lng?: number | null;
  customer_location_accuracy_m?: number | null;
  customer_location_captured_at?: string | null;
};

type VendorProfile = {
  id: string;
  full_name: string | null;
  phone: string | null;
  address: string | null;
  store_address: string | null;
  store_name: string | null;
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

function cleanText(s: string | null | undefined) {
  return String(s ?? "").trim();
}

function safeNumber(x: unknown, fallback = 0) {
  if (typeof x === "number" && Number.isFinite(x)) return x;
  if (typeof x === "string") {
    const n = Number(x);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

function preferPositive(primary: unknown, fallback: unknown) {
  const first = safeNumber(primary, 0);
  if (first > 0) return first;
  return safeNumber(fallback, 0);
}

async function authorize(req: Request) {
  const token = readBearerToken(req);
  if (!token) {
    return { ok: false as const, response: NextResponse.json({ ok: false, error: "Missing Authorization Bearer token" }, { status: 401 }) };
  }

  const anon = anonClient();
  const { data: authData, error: authErr } = await anon.auth.getUser(token);
  if (authErr || !authData?.user) {
    return { ok: false as const, response: NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 }) };
  }

  const a = adminClient();
  const { data: prof, error: profErr } = await a
    .from("profiles")
    .select("id,role")
    .eq("id", authData.user.id)
    .maybeSingle();

  if (profErr) {
    return { ok: false as const, response: NextResponse.json({ ok: false, error: "Profile error: " + profErr.message }, { status: 500 }) };
  }

  const role = String(prof?.role ?? "");
  if (role !== "logistics" && role !== "admin") {
    return { ok: false as const, response: NextResponse.json({ ok: false, error: "Not authorized" }, { status: 403 }) };
  }

  return { ok: true as const, admin: a };
}

export async function GET(req: Request) {
  try {
    const auth = await authorize(req);
    if (!auth.ok) return auth.response;

    const a = auth.admin;
    const url = new URL(req.url);
    const status = cleanText(url.searchParams.get("status"));

    let query = a
      .from("logistics_jobs")
      .select(
        "id,order_id,vendor_id,customer_id,status,created_at,updated_at,vendor_name,vendor_phone,vendor_address,customer_name,customer_phone,delivery_address,order_type,food_mode,order_total"
      )
      .order("created_at", { ascending: false });

    if (status === "active") {
      query = query.in("status", ["pending_pickup", "picked_up"]);
    } else if (status === "history") {
      query = query.in("status", ["delivered", "cancelled"]);
    }

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    const rows = (data ?? []) as LogisticsJobRow[];
    const orderIds = Array.from(new Set(rows.map((r) => cleanText(r.order_id)).filter(Boolean)));
    const vendorIds = Array.from(new Set(rows.map((r) => cleanText(r.vendor_id)).filter(Boolean)));

    const orderNoteMap = new Map<string, string>();
    const orderDeliveryFeeMap = new Map<string, number>();
    const orderTotalMap = new Map<string, number>();
    const orderExactLocationMap = new Map<
      string,
      { lat: number | null; lng: number | null; accuracy: number | null; capturedAt: string | null }
    >();
    if (orderIds.length > 0) {
      const { data: orderRows } = await a
        .from("orders")
        .select("id,notes,delivery_fee,total,total_amount,customer_lat,customer_lng,customer_location_accuracy_m,customer_location_captured_at")
        .in("id", orderIds);

      for (const o of (orderRows ?? []) as Array<{
        id: string;
        notes: string | null;
        delivery_fee: number | null;
        total: number | null;
        total_amount: number | null;
        customer_lat: number | null;
        customer_lng: number | null;
        customer_location_accuracy_m: number | null;
        customer_location_captured_at: string | null;
      }>) {
        orderNoteMap.set(o.id, cleanText(o.notes));
        orderDeliveryFeeMap.set(o.id, safeNumber(o.delivery_fee, 0));
        orderTotalMap.set(o.id, safeNumber(o.total_amount ?? o.total, 0));
        orderExactLocationMap.set(o.id, {
          lat: typeof o.customer_lat === "number" ? o.customer_lat : null,
          lng: typeof o.customer_lng === "number" ? o.customer_lng : null,
          accuracy: safeNumber(o.customer_location_accuracy_m, 0) || null,
          capturedAt: cleanText(o.customer_location_captured_at) || null,
        });
      }
    }

    const vendorMap = new Map<string, VendorProfile>();
    if (vendorIds.length > 0) {
      const { data: vendors } = await a
        .from("profiles")
        .select("id,full_name,phone,address,store_address,store_name")
        .in("id", vendorIds);

      for (const v of (vendors ?? []) as VendorProfile[]) {
        vendorMap.set(v.id, v);
      }
    }

    const jobs = rows
      .map((j) => {
        const v = vendorMap.get(j.vendor_id);
        const note = orderNoteMap.get(j.order_id) || "";
        const manual = parseManualLogisticsNotes(note);

        return {
          ...j,
          vendor_name: cleanText(j.vendor_name) || cleanText(v?.store_name) || cleanText(v?.full_name) || null,
          vendor_phone: cleanText(j.vendor_phone) || cleanText(v?.phone) || null,
          vendor_address: cleanText(j.vendor_address) || cleanText(v?.store_address) || cleanText(v?.address) || null,
          customer_name: manual.isManual && manual.source !== "vendor" ? manual.customerName || j.customer_name : j.customer_name,
          customer_note: manual.isManual && manual.source !== "vendor" ? manual.itemsText || null : stripLogisticsMeta(note) || null,
          rider_map_url: manual.riderMapUrl || null,
          delivery_fee: orderDeliveryFeeMap.get(j.order_id) ?? 0,
          order_total: preferPositive(j.order_total, orderTotalMap.get(j.order_id)),
          customer_lat: orderExactLocationMap.get(j.order_id)?.lat ?? null,
          customer_lng: orderExactLocationMap.get(j.order_id)?.lng ?? null,
          customer_location_accuracy_m: orderExactLocationMap.get(j.order_id)?.accuracy ?? null,
          customer_location_captured_at: orderExactLocationMap.get(j.order_id)?.capturedAt ?? null,
          hideFromLogistics: manual.isManual && manual.source === "vendor",
        };
      })
      .filter((j) => !j.hideFromLogistics)
      .map((j) => {
        const { hideFromLogistics: _hideFromLogistics, ...next } = j;
        return next;
      });

    return NextResponse.json({ ok: true, jobs });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
