import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type Role = "customer" | "vendor_food" | "vendor_products" | "logistics" | "admin";
type VendorCategory = "food" | "products" | null;

type EnsureProfileBody = {
  userId?: string;
  role?: Role;
  fullName?: string;
  phone?: string;
  address?: string;
  storeName?: string;
  storeAddress?: string;
  vendorCategory?: VendorCategory;
};

function clean(v: unknown) {
  return typeof v === "string" ? v.trim() : "";
}

export async function POST(req: Request) {
  let body: EnsureProfileBody;
  try {
    body = (await req.json()) as EnsureProfileBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const userId = clean(body.userId);
  const role = (body.role ?? "customer") as Role;
  const fullName = clean(body.fullName);
  const phone = clean(body.phone);
  const address = clean(body.address);
  const storeName = clean(body.storeName);
  const storeAddress = clean(body.storeAddress);
  const vendorCategory = body.vendorCategory ?? null;

  if (!userId) return NextResponse.json({ ok: false, error: "Missing userId" }, { status: 400 });

  const validRoles: Role[] = ["customer", "vendor_food", "vendor_products", "logistics", "admin"];
  if (!validRoles.includes(role)) {
    return NextResponse.json({ ok: false, error: "Invalid role" }, { status: 400 });
  }

  if (vendorCategory !== null && vendorCategory !== "food" && vendorCategory !== "products") {
    return NextResponse.json({ ok: false, error: "Invalid vendorCategory" }, { status: 400 });
  }

  const payload = {
    id: userId,
    role,
    full_name: fullName,
    phone,
    address,
    store_name: storeName || null,
    store_address: storeAddress || null,
    vendor_category: vendorCategory,
  };

  const { error } = await supabaseAdmin.from("profiles").upsert(payload, { onConflict: "id" });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
