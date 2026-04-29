import { NextResponse } from "next/server";
import { publishMenuDraft } from "@/lib/menu-import/publish";
import { validateMenuDraftForPublish } from "@/lib/menu-import/review";
import { requireVendorActor } from "@/lib/menu-import/server-auth";
import type { MenuImportDraft } from "@/lib/menu-import/types";

export async function POST(req: Request, context: { params: Promise<{ sessionId: string }> }) {
  try {
    const actor = await requireVendorActor(req);
    const { sessionId } = await context.params;
    const body = (await req.json().catch(() => null)) as { draft?: MenuImportDraft } | null;
    if (!body?.draft) return NextResponse.json({ ok: false, error: "Draft payload is required." }, { status: 400 });
    const normalizedDraft = validateMenuDraftForPublish(body.draft);

    await publishMenuDraft(sessionId, actor.userId, normalizedDraft);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const status =
      error instanceof Error && error.name === "AuthError"
        ? 401
        : error instanceof Error && error.name === "RoleError"
          ? 403
          : 500;
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unexpected publish error." },
      { status }
    );
  }
}
