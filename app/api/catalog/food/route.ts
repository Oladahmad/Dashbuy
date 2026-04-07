import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { evaluateStoreAvailability } from "@/lib/storeHours";

type RestaurantRow = {
  vendor_id: string;
  name: string;
  area: string | null;
  single_count: number;
  combo_count: number;
  logo_url: string | null;
  is_open: boolean;
  status_label: string;
};

export async function GET() {
  const { data: combos, error: combosError } = await supabaseAdmin
    .from("food_items")
    .select("id,name,price,image_url,short_description,vendor_id,profiles(store_name,full_name)")
    .eq("food_type", "combo")
    .eq("is_available", true)
    .order("created_at", { ascending: false });

  if (combosError) {
    return NextResponse.json(
      { ok: false, error: "Combos error: " + combosError.message, combos: [], restaurants: [] },
      { status: 500 }
    );
  }

  const { data: singles, error: singlesError } = await supabaseAdmin
    .from("food_items")
    .select("vendor_id")
    .eq("food_type", "single")
    .eq("is_available", true);

  if (singlesError) {
    return NextResponse.json(
      { ok: false, error: "Restaurants error: " + singlesError.message, combos: combos ?? [], restaurants: [] },
      { status: 500 }
    );
  }

  const counts = new Map<string, number>();
  (singles || []).forEach((row: { vendor_id: string }) => {
    const vid = row.vendor_id;
    counts.set(vid, (counts.get(vid) || 0) + 1);
  });

  const comboCounts = new Map<string, number>();
  ((combos ?? []) as Array<{ vendor_id: string }>).forEach((row) => {
    const vid = row.vendor_id;
    comboCounts.set(vid, (comboCounts.get(vid) || 0) + 1);
  });

  const { data: profiles, error: profilesError } = await supabaseAdmin
    .from("profiles")
    .select("id,store_name,full_name,store_address,address,logo_url,role,is_store_open,store_closed_note,store_hours_json")
    .eq("role", "vendor_food");

  if (profilesError) {
    return NextResponse.json(
      { ok: false, error: "Restaurants error: " + profilesError.message, combos: combos ?? [], restaurants: [] },
      { status: 500 }
    );
  }

  const profileMap = new Map<string, Record<string, unknown>>();
  for (const row of (profiles as Record<string, unknown>[] | null) ?? []) {
    profileMap.set(String(row.id || ""), row);
  }

  const restaurants: RestaurantRow[] = (profiles || []).map((p: Record<string, unknown>) => {
    const id = String(p.id || "");
    const storeName = String(p.store_name || "").trim();
    const fullName = String(p.full_name || "").trim();
    const storeAddress = String(p.store_address || "").trim();
    const address = String(p.address || "").trim();

    const availability = evaluateStoreAvailability({
      isStoreOpen: p.is_store_open as boolean | null | undefined,
      storeHours: p.store_hours_json,
      closedNote: String(p.store_closed_note || ""),
    });

    return {
      vendor_id: id,
      name: storeName || fullName || "Vendor",
      area: storeAddress || address || null,
      single_count: counts.get(id) || 0,
      combo_count: comboCounts.get(id) || 0,
      logo_url: String(p.logo_url || "").trim() || null,
      is_open: availability.isOpen,
      status_label: availability.statusLabel,
    };
  });

  restaurants.sort((a, b) => a.name.localeCompare(b.name));

  const combosWithAvailability = ((combos ?? []) as Array<Record<string, unknown>>).map((combo) => {
    const vendorId = String(combo.vendor_id || "");
    const vendorProfile = profileMap.get(vendorId) ?? {};
    const availability = evaluateStoreAvailability({
      isStoreOpen: vendorProfile.is_store_open as boolean | null | undefined,
      storeHours: vendorProfile.store_hours_json,
      closedNote: String(vendorProfile.store_closed_note || ""),
    });
    return {
      ...combo,
      is_vendor_open: availability.isOpen,
      vendor_status_label: availability.statusLabel,
    };
  });

  return NextResponse.json({ ok: true, combos: combosWithAvailability, restaurants });
}
