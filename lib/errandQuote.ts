export type ErrandQuoteStatus = "pending" | "quoted" | "approved";

export type ErrandQuoteMeta = {
  isErrand: boolean;
  status: ErrandQuoteStatus | null;
  quotedTotal: number | null;
};

const MARKER_ERRAND = "[ERRAND=1]";
const STATUS_RE = /\[ERRAND_QUOTE_STATUS=(pending|quoted|approved)\]/i;
const TOTAL_RE = /\[ERRAND_QUOTE_TOTAL=([0-9]+(?:\.[0-9]+)?)\]/i;
const STRIP_RE = /\[ERRAND=1\]|\[ERRAND_QUOTE_STATUS=[^\]]+\]|\[ERRAND_QUOTE_TOTAL=[^\]]+\]/gi;

export function parseErrandQuote(notes: string | null | undefined): ErrandQuoteMeta {
  const text = String(notes ?? "");
  const isErrand = text.includes(MARKER_ERRAND);
  const statusMatch = text.match(STATUS_RE);
  const status = statusMatch?.[1]?.toLowerCase() as ErrandQuoteStatus | undefined;
  const totalMatch = text.match(TOTAL_RE);
  const quotedTotal = totalMatch ? Number(totalMatch[1]) : null;

  return {
    isErrand,
    status: isErrand ? status ?? "pending" : null,
    quotedTotal: Number.isFinite(quotedTotal as number) ? quotedTotal : null,
  };
}

export function withErrandQuoteMeta(
  notes: string | null | undefined,
  patch: {
    isErrand?: boolean;
    status?: ErrandQuoteStatus | null;
    quotedTotal?: number | null;
  },
) {
  const clean = String(notes ?? "")
    .replace(STRIP_RE, "")
    .replace(/\s+\|\s+\|\s+/g, " | ")
    .replace(/\s{2,}/g, " ")
    .trim()
    .replace(/^\|\s*/, "")
    .replace(/\s*\|$/, "");

  const markers: string[] = [];
  if (patch.isErrand ?? true) markers.push(MARKER_ERRAND);
  if (patch.status) markers.push(`[ERRAND_QUOTE_STATUS=${patch.status}]`);
  if (typeof patch.quotedTotal === "number" && Number.isFinite(patch.quotedTotal)) {
    markers.push(`[ERRAND_QUOTE_TOTAL=${Math.max(0, patch.quotedTotal)}]`);
  }

  const markerText = markers.join(" ");
  return clean ? `${clean} | ${markerText}` : markerText;
}

