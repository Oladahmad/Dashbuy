import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type RestaurantRow = {
  vendor_id: string;
  name: string;
  area: string | null;
  single_count: number;
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

  const vendorIds = Array.from(counts.keys());
  if (vendorIds.length === 0) {
    return NextResponse.json({ ok: true, combos: combos ?? [], restaurants: [] });
  }

  const { data: profiles, error: profilesError } = await supabaseAdmin
    .from("profiles")
    .select("id,store_name,full_name,store_address,address")
    .in("id", vendorIds);

  if (profilesError) {
    return NextResponse.json(
      { ok: false, error: "Restaurants error: " + profilesError.message, combos: combos ?? [], restaurants: [] },
      { status: 500 }
    );
  }

  const restaurants: RestaurantRow[] = (profiles || []).map((p: Record<string, unknown>) => {
    const id = String(p.id || "");
    const storeName = String(p.store_name || "").trim();
    const fullName = String(p.full_name || "").trim();
    const storeAddress = String(p.store_address || "").trim();
    const address = String(p.address || "").trim();

    return {
      vendor_id: id,
      name: storeName || fullName || "Vendor",
      area: storeAddress || address || null,
      single_count: counts.get(id) || 0,
    };
  });

  restaurants.sort((a, b) => a.name.localeCompare(b.name));

  return NextResponse.json({ ok: true, combos: combos ?? [], restaurants });
}
