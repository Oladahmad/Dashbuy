import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireVendorActor } from "@/lib/menu-import/server-auth";
import { normalizeMenuDraft } from "@/lib/menu-import/review";
import type { MenuImportDraft } from "@/lib/menu-import/types";

type SessionRow = {
  id: string;
  vendor_id: string;
  status: string | null;
  review_menu: MenuImportDraft | null;
  extracted_menu: MenuImportDraft | null;
  warnings: unknown;
};

export async function GET(req: Request, context: { params: Promise<{ sessionId: string }> }) {
  try {
    const actor = await requireVendorActor(req);
    const { sessionId } = await context.params;
    const { data, error } = await supabaseAdmin
      .from("menu_import_sessions")
      .select("id,vendor_id,status,review_menu,extracted_menu,warnings")
      .eq("id", sessionId)
      .eq("vendor_id", actor.userId)
      .maybeSingle<SessionRow>();

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ ok: false, error: "Import session not found." }, { status: 404 });

    return NextResponse.json({
      ok: true,
      sessionId: data.id,
      status: data.status ?? "review",
      draft: (data.review_menu ?? data.extracted_menu) || null,
      warnings: data.warnings ?? [],
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unexpected session fetch error." },
      { status: 500 }
    );
  }
}

export async function PATCH(req: Request, context: { params: Promise<{ sessionId: string }> }) {
  try {
    const actor = await requireVendorActor(req);
    const { sessionId } = await context.params;
    const body = (await req.json().catch(() => null)) as { draft?: MenuImportDraft } | null;
    if (!body?.draft) return NextResponse.json({ ok: false, error: "Draft payload is required." }, { status: 400 });
    const normalizedDraft = normalizeMenuDraft(body.draft);

    const { error } = await supabaseAdmin
      .from("menu_import_sessions")
      .update({
        status: "review",
        review_menu: normalizedDraft,
        warnings: normalizedDraft.warnings,
        updated_at: new Date().toISOString(),
      })
      .eq("id", sessionId)
      .eq("vendor_id", actor.userId);

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, draft: normalizedDraft });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unexpected draft save error." },
      { status: 500 }
    );
  }
}
