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
  updated_at: string;
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

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const token = readBearerToken(req);
    if (!token) {
      return NextResponse.json({ ok: false, error: "Missing Authorization Bearer token" }, { status: 401 });
    }

    const anon = anonClient();
    const { data: authData, error: authErr } = await anon.auth.getUser(token);
    if (authErr || !authData?.user) {
      return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });
    }

    const a = adminClient();
    const { data: prof, error: profErr } = await a
      .from("profiles")
      .select("id,role")
      .eq("id", authData.user.id)
      .maybeSingle();

    if (profErr) {
      return NextResponse.json({ ok: false, error: "Profile error: " + profErr.message }, { status: 500 });
    }

    const role = String(prof?.role ?? "");
    if (role !== "logistics" && role !== "admin") {
      return NextResponse.json({ ok: false, error: "Not authorized" }, { status: 403 });
    }

    const { id } = await ctx.params;
    const jobId = cleanText(id);
    if (!jobId) return NextResponse.json({ ok: false, error: "Missing job id" }, { status: 400 });

    const { data, error } = await a
      .from("logistics_jobs")
      .select(
        "id,order_id,vendor_id,customer_id,status,created_at,updated_at,vendor_name,vendor_phone,vendor_address,customer_name,customer_phone,delivery_address,order_type,food_mode,order_total"
      )
      .eq("id", jobId)
      .maybeSingle();

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ ok: false, error: "History item not found" }, { status: 404 });

    const row = data as LogisticsJobRow;

    const [{ data: orderRow }, { data: vendorRow }] = await Promise.all([
      a
        .from("orders")
        .select("notes,delivery_fee,total,total_amount,customer_lat,customer_lng,customer_location_accuracy_m,customer_location_captured_at")
        .eq("id", row.order_id)
        .maybeSingle(),
      a
        .from("profiles")
        .select("id,full_name,phone,address,store_address,store_name")
        .eq("id", row.vendor_id)
        .maybeSingle(),
    ]);

    const vendor = (vendorRow ?? null) as VendorProfile | null;
    const order = (orderRow ?? null) as {
      notes: string | null;
      delivery_fee: number | null;
      total: number | null;
      total_amount: number | null;
      customer_lat: number | null;
      customer_lng: number | null;
      customer_location_accuracy_m: number | null;
      customer_location_captured_at: string | null;
    } | null;

    const note = cleanText(order?.notes);
    const manual = parseManualLogisticsNotes(note);
    if (manual.isManual && manual.source === "vendor") {
      return NextResponse.json({ ok: false, error: "This vendor manual order is not part of logistics history." }, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      job: {
        ...row,
        vendor_name: cleanText(row.vendor_name) || cleanText(vendor?.store_name) || cleanText(vendor?.full_name) || null,
        vendor_phone: cleanText(row.vendor_phone) || cleanText(vendor?.phone) || null,
        vendor_address: cleanText(row.vendor_address) || cleanText(vendor?.store_address) || cleanText(vendor?.address) || null,
        customer_name: manual.isManual && manual.source !== "vendor" ? manual.customerName || row.customer_name : row.customer_name,
        customer_note: manual.isManual && manual.source !== "vendor" ? manual.itemsText || null : stripLogisticsMeta(note) || null,
        delivery_fee: safeNumber(order?.delivery_fee, 0),
        order_total: preferPositive(row.order_total, order?.total_amount ?? order?.total),
        customer_lat: typeof order?.customer_lat === "number" ? order.customer_lat : null,
        customer_lng: typeof order?.customer_lng === "number" ? order.customer_lng : null,
        customer_location_accuracy_m: safeNumber(order?.customer_location_accuracy_m, 0) || null,
        customer_location_captured_at: cleanText(order?.customer_location_captured_at) || null,
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
