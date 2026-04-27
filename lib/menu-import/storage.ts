import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { extensionFromMime, makeId } from "./utils";

export async function uploadImportSource(params: {
  vendorId: string;
  filename: string;
  mimeType: string;
  buffer: Buffer;
}) {
  const ext = extensionFromMime(params.mimeType);
  const path = `vendors/${params.vendorId}/menu-imports/${makeId("source")}.${ext}`;
  const { error } = await supabaseAdmin.storage.from("menu-imports").upload(path, params.buffer, {
    contentType: params.mimeType,
    upsert: true,
  });
  if (error) throw new Error("Could not upload source file: " + error.message);
  return path;
}

export async function uploadFoodImageFromBuffer(params: {
  vendorId: string;
  buffer: Buffer;
  mimeType: string;
  prefix?: string;
}) {
  const ext = extensionFromMime(params.mimeType);
  const path = `vendors/${params.vendorId}/foods/${params.prefix ?? "ai"}-${makeId("img")}.${ext}`;
  const { error } = await supabaseAdmin.storage.from("food-images").upload(path, params.buffer, {
    contentType: params.mimeType,
    upsert: true,
  });
  if (error) throw new Error("Could not upload food image: " + error.message);
  return getStoragePublicUrl("food-images", path);
}

export function getStoragePublicUrl(bucket: "food-images" | "menu-imports", path: string) {
  const { data } = supabaseAdmin.storage.from(bucket).getPublicUrl(path);
  if (!data.publicUrl) throw new Error(`Could not get public URL for ${bucket} asset`);
  return data.publicUrl;
}
