import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

function readBearerToken(req: NextRequest) {
  const h = req.headers.get("authorization") || "";
  const parts = h.split(" ");
  if (parts.length === 2 && parts[0].toLowerCase() === "bearer" && parts[1]) return parts[1].trim();
  return "";
}

export async function GET(req: NextRequest) {
  try {
    const token = readBearerToken(req);
    if (!token) return NextResponse.json({ ok: false, error: "Missing auth token" }, { status: 401 });

    const { data: authData, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !authData.user) return NextResponse.json({ ok: false, error: "Invalid session" }, { status: 401 });

    const actorId = authData.user.id;
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", actorId)
      .maybeSingle<{ role: string }>();
    if (String(profile?.role ?? "") !== "admin") {
      return NextResponse.json({ ok: false, error: "Not authorized" }, { status: 403 });
    }

    const { data, error } = await supabaseAdmin
      .from("vendor_payouts")
      .select("id,vendor_id,order_id,amount,reference,created_at,status,type,bank_name,bank_code,account_number,account_name")
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    const vendorIds = Array.from(
      new Set(((data ?? []) as Array<{ vendor_id: string | null }>).map((row) => String(row.vendor_id ?? "")).filter(Boolean))
    );

    const vendorMap = new Map<string, string>();
    if (vendorIds.length > 0) {
      const { data: vendors } = await supabaseAdmin
        .from("profiles")
        .select("id,store_name,full_name")
        .in("id", vendorIds);
      for (const row of (vendors as Array<{ id: string; store_name?: string | null; full_name?: string | null }> | null) ?? []) {
        vendorMap.set(row.id, String(row.store_name ?? "").trim() || String(row.full_name ?? "").trim() || "Vendor");
      }
    }

    const items = ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
      id: String(row.id ?? ""),
      vendor_id: String(row.vendor_id ?? ""),
      vendor_name: vendorMap.get(String(row.vendor_id ?? "")) ?? "Vendor",
      order_id: row.order_id ? String(row.order_id) : null,
      amount: Number(row.amount ?? 0),
      reference: row.reference ? String(row.reference) : null,
      created_at: String(row.created_at ?? ""),
      status: row.status ? String(row.status) : null,
      type: row.type ? String(row.type) : null,
      bank_name: row.bank_name ? String(row.bank_name) : null,
      bank_code: row.bank_code ? String(row.bank_code) : null,
      account_number: row.account_number ? String(row.account_number) : null,
      account_name: row.account_name ? String(row.account_name) : null,
    }));

    return NextResponse.json({ ok: true, items });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unexpected error" },
      { status: 500 }
    );
  }
}
