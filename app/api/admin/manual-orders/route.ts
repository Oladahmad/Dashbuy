import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { parseManualLogisticsNotes } from "@/lib/manualLogistics";
import { extractOrderNameFromNotes } from "@/lib/orderName";

type ManualOrderRow = {
  id: string;
  vendor_id: string;
  status: string | null;
  total: number | null;
  customer_phone: string | null;
  delivery_address: string | null;
  notes: string | null;
  created_at: string;
};

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
      .from("orders")
      .select("id,vendor_id,status,total,customer_phone,delivery_address,notes,created_at")
      .ilike("notes", "%[LOGI_DIRECT=1]%")
      .order("created_at", { ascending: false });

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    const vendorIds = Array.from(
      new Set(
        (((data ?? []) as ManualOrderRow[]) || [])
          .map((row) => row.vendor_id)
          .filter(Boolean)
      )
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

    const items = (((data ?? []) as ManualOrderRow[]) || [])
      .filter((row) => {
        const manual = parseManualLogisticsNotes(row.notes);
        return manual.isManual && manual.source === "vendor";
      })
      .map((row) => {
        const manual = parseManualLogisticsNotes(row.notes);
        return {
          id: row.id,
          vendor_id: row.vendor_id,
          vendor_name: vendorMap.get(row.vendor_id) ?? "Vendor",
          status: row.status,
          total: Number(row.total ?? 0),
          customer_name: manual.customerName || "Customer",
          customer_phone: row.customer_phone ?? "",
          delivery_address: row.delivery_address ?? "",
          order_name: extractOrderNameFromNotes(row.notes) || "Manual order",
          items_text: manual.itemsText || "",
          created_at: row.created_at,
        };
      });

    return NextResponse.json({ ok: true, items });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unexpected error" },
      { status: 500 }
    );
  }
}
