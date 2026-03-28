import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type Params = {
  params: Promise<{ vendorId: string }>;
};

export async function GET(_: Request, { params }: Params) {
  const { vendorId } = await params;

  if (!vendorId) {
    return NextResponse.json(
      { ok: false, error: "Missing vendor id", vendor: null, plates: [], items: [], variants: [] },
      { status: 400 }
    );
  }

  const { data: vendor, error: vendorError } = await supabaseAdmin
    .from("profiles")
    .select("id,store_name,full_name,store_address,address,phone,logo_url")
    .eq("id", vendorId)
    .maybeSingle();

  if (vendorError || !vendor) {
    return NextResponse.json(
      { ok: false, error: "Vendor not found", vendor: null, plates: [], items: [], variants: [] },
      { status: 404 }
    );
  }

  const { data: plates, error: platesError } = await supabaseAdmin
    .from("plate_templates")
    .select("id,name,plate_fee,is_active")
    .eq("vendor_id", vendorId)
    .eq("is_active", true)
    .order("plate_fee", { ascending: true });

  if (platesError) {
    const plateErrorMessage = platesError.message.includes("plate_templates.vendor_id")
      ? "Database update needed: add vendor_id column to plate_templates first."
      : platesError.message;
    return NextResponse.json(
      { ok: false, error: "Plates error: " + plateErrorMessage, vendor, plates: [], items: [], variants: [] },
      { status: 500 }
    );
  }

  const { data: items, error: itemsError } = await supabaseAdmin
    .from("food_items")
    .select(
      "id,name,category,pricing_type,price,unit_label,unit_price,short_description,image_url,min_qty,max_qty,stock_qty,is_available"
    )
    .eq("vendor_id", vendorId)
    .eq("food_type", "single")
    .eq("is_available", true)
    .order("category", { ascending: true })
    .order("name", { ascending: true });

  if (itemsError) {
    return NextResponse.json(
      { ok: false, error: "Menu error: " + itemsError.message, vendor, plates: plates ?? [], items: [], variants: [] },
      { status: 500 }
    );
  }

  const itemIds = (items ?? []).map((x: { id: string }) => x.id);
  let variants: unknown[] = [];

  if (itemIds.length > 0) {
    const { data: variantRows, error: variantsError } = await supabaseAdmin
      .from("food_item_variants")
      .select("id,food_item_id,name,price,is_available")
      .in("food_item_id", itemIds)
      .eq("is_available", true)
      .order("price", { ascending: true })
      .order("name", { ascending: true });

    if (variantsError) {
      return NextResponse.json(
        {
          ok: false,
          error: "Variants error: " + variantsError.message,
          vendor,
          plates: plates ?? [],
          items: items ?? [],
          variants: [],
        },
        { status: 500 }
      );
    }

    variants = variantRows ?? [];
  }

  return NextResponse.json({
    ok: true,
    vendor,
    plates: plates ?? [],
    items: items ?? [],
    variants,
  });
}
