import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { ingestMenuUpload } from "@/lib/menu-import/document";
import { enrichDraftWithImages } from "@/lib/menu-import/images";
import { buildMenuDraft } from "@/lib/menu-import/parser";
import { requireVendorActor } from "@/lib/menu-import/server-auth";
import { uploadImportSource } from "@/lib/menu-import/storage";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const actor = await requireVendorActor(req);
    const formData = await req.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, error: "Upload file is required." }, { status: 400 });
    }

    const ingested = await ingestMenuUpload(file);
    const sourceBuffer = Buffer.from(await file.arrayBuffer());
    const sourceStoragePath = await uploadImportSource({
      vendorId: actor.userId,
      filename: file.name,
      mimeType: ingested.mimeType,
      buffer: sourceBuffer,
    });
    const draft = await buildMenuDraft(ingested);
    await enrichDraftWithImages(draft, actor.userId);

    const { data, error } = await supabaseAdmin
      .from("menu_import_sessions")
      .insert({
        vendor_id: actor.userId,
        source_file_name: file.name,
        source_mime_type: file.type,
        source_file_size: file.size,
        source_storage_path: sourceStoragePath,
        status: "review",
        extracted_menu: draft,
        review_menu: draft,
        warnings: draft.warnings,
        processing_notes: ingested.processingNotes,
      })
      .select("id")
      .maybeSingle<{ id: string }>();

    if (error || !data?.id) {
      return NextResponse.json({ ok: false, error: "Could not create import session: " + (error?.message ?? "Unknown error") }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      sessionId: data.id,
      draft: {
        ...draft,
        sessionId: data.id,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected menu import error.";
    const status =
      /unsupported|empty|size limit|required|invalid/i.test(message) ? 400 : 500;
    return NextResponse.json(
      { ok: false, error: message },
      { status }
    );
  }
}
