export const REJECT_REASON_TAG = "[REJECT_REASON=";

function cleanText(s: string) {
  return s.replace(/\s+/g, " ").trim();
}

export function stripRejectReasonTag(notes: string | null | undefined) {
  const src = String(notes ?? "");
  const re = /\[REJECT_REASON=([^\]]*)\]/gi;
  return cleanText(src.replace(re, " ").trim());
}

export function parseRejectReason(notes: string | null | undefined) {
  const src = String(notes ?? "");
  const re = /\[REJECT_REASON=([^\]]*)\]/i;
  const m = src.match(re);
  if (!m?.[1]) return "";
  return cleanText(m[1].replace(/\|/g, " ").trim());
}

export function appendRejectReason(notes: string | null | undefined, reason: string) {
  const cleanedReason = cleanText(reason).slice(0, 400);
  const base = stripRejectReasonTag(notes);
  if (!cleanedReason) return base;
  const tag = `[REJECT_REASON=${cleanedReason}]`;
  return cleanText([base, tag].filter(Boolean).join(" ").trim());
}

