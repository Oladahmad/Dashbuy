export type ManualMeta = {
  isManual: boolean;
  customerName: string;
  itemsText: string;
  riderMapUrl: string;
  source: "logistics" | "vendor";
};

const MARKER = "[LOGI_DIRECT=1]";
const SOURCE_RE = /\[LOGI_SOURCE=([^\]]*)\]/i;
const CUSTOMER_RE = /\[LOGI_CUSTOMER=([^\]]*)\]/i;
const ITEMS_RE = /\[LOGI_ITEMS=([^\]]*)\]/i;
const RIDER_MAP_RE = /\[LOGI_RIDER_MAP=([^\]]*)\]/i;
const STRIP_RE = /\[LOGI_DIRECT=1\]|\[LOGI_SOURCE=[^\]]*\]|\[LOGI_CUSTOMER=[^\]]*\]|\[LOGI_ITEMS=[^\]]*\]|\[LOGI_RIDER_MAP=[^\]]*\]/gi;
const STRIP_RIDER_MAP_RE = /\[LOGI_RIDER_MAP=[^\]]*\]/gi;

function enc(v: string) {
  return encodeURIComponent(v.trim());
}

function dec(v: string) {
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
}

export function buildManualLogisticsNotes(
  baseNotes: string,
  customerName: string,
  itemsText: string,
  riderMapUrl = "",
  source: "logistics" | "vendor" = "logistics"
) {
  const clean = String(baseNotes ?? "")
    .replace(STRIP_RE, "")
    .trim()
    .replace(/^\|\s*/, "")
    .replace(/\s*\|$/, "");

  const rider = riderMapUrl.trim() ? ` [LOGI_RIDER_MAP=${enc(riderMapUrl)}]` : "";
  const marker = `${MARKER} [LOGI_SOURCE=${enc(source)}] [LOGI_CUSTOMER=${enc(customerName)}] [LOGI_ITEMS=${enc(itemsText)}]${rider}`;
  return clean ? `${clean} | ${marker}` : marker;
}

export function parseManualLogisticsNotes(notes: string | null | undefined): ManualMeta {
  const text = String(notes ?? "");
  const isManual = text.includes(MARKER);
  const customer = text.match(CUSTOMER_RE)?.[1] ?? "";
  const items = text.match(ITEMS_RE)?.[1] ?? "";
  const riderMap = text.match(RIDER_MAP_RE)?.[1] ?? "";
  const sourceRaw = dec(text.match(SOURCE_RE)?.[1] ?? "").toLowerCase();
  return {
    isManual,
    customerName: dec(customer),
    itemsText: dec(items),
    riderMapUrl: dec(riderMap),
    source: sourceRaw === "vendor" ? "vendor" : "logistics",
  };
}

export function stripLogisticsMeta(notes: string | null | undefined) {
  return String(notes ?? "")
    .replace(STRIP_RE, "")
    .trim()
    .replace(/^\|\s*/, "")
    .replace(/\s*\|$/, "");
}

export function upsertRiderMapInNotes(notes: string | null | undefined, riderMapUrl: string) {
  const cleanBase = String(notes ?? "")
    .replace(STRIP_RIDER_MAP_RE, "")
    .trim()
    .replace(/\s*\|\s*$/, "");

  const rider = riderMapUrl.trim();
  if (!rider) return cleanBase;

  const marker = `[LOGI_RIDER_MAP=${enc(rider)}]`;
  return cleanBase ? `${cleanBase} | ${marker}` : marker;
}
