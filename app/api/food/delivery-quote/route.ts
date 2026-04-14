import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getFoodDeliveryFee, normalizeFoodCustomerLocation, normalizeFoodVendorOrigin } from "@/lib/foodDeliveryMatrix";

type QuoteBody = {
  vendorIds?: string[];
  customerLocation?: string;
};

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as QuoteBody | null;
    const vendorIds = Array.from(
      new Set(
        (Array.isArray(body?.vendorIds) ? body?.vendorIds : [])
          .map((value) => String(value ?? "").trim())
          .filter(Boolean)
      )
    );
    const customerLocation = normalizeFoodCustomerLocation(body?.customerLocation);

    if (!customerLocation) {
      return NextResponse.json({ ok: false, error: "Choose your delivery location" }, { status: 400 });
    }
    if (vendorIds.length === 0) {
      return NextResponse.json({ ok: false, error: "Missing vendors" }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select("id,store_name,full_name,food_delivery_origin")
      .in("id", vendorIds);

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    const rows = (data ?? []) as Array<{ id: string; store_name: string | null; full_name: string | null; food_delivery_origin: string | null }>;
    const vendorMap = new Map(rows.map((row) => [row.id, row]));

    const byVendor: Record<string, { vendorName: string; origin: string | null; fee: number | null; error?: string }> = {};
    let total = 0;

    for (const vendorId of vendorIds) {
      const row = vendorMap.get(vendorId);
      const vendorName = String(row?.store_name ?? "").trim() || String(row?.full_name ?? "").trim() || "Food vendor";
      const origin = normalizeFoodVendorOrigin(row?.food_delivery_origin);

      if (!origin) {
        byVendor[vendorId] = { vendorName, origin: null, fee: null, error: "Vendor delivery origin is not set yet" };
        continue;
      }

      const fee = getFoodDeliveryFee(origin, customerLocation);
      if (fee == null) {
        byVendor[vendorId] = { vendorName, origin, fee: null, error: `No delivery price set from ${origin} to ${customerLocation}` };
        continue;
      }

      byVendor[vendorId] = { vendorName, origin, fee };
      total += fee;
    }

    return NextResponse.json({
      ok: true,
      customerLocation,
      total,
      byVendor,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Unexpected error" }, { status: 500 });
  }
}
