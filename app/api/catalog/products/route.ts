import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from("products")
    .select(
      "id,vendor_id,name,price,category,description,image_path,created_at,profiles:vendor_id(full_name,store_name)"
    )
    .eq("is_available", true)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message, products: [] },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, products: data ?? [] });
}
