export type ManualMeta = {
  isManual: boolean;
  customerName: string;
  itemsText: string;
};

const MARKER = "[LOGI_DIRECT=1]";
const CUSTOMER_RE = /\[LOGI_CUSTOMER=([^\]]*)\]/i;
const ITEMS_RE = /\[LOGI_ITEMS=([^\]]*)\]/i;
const STRIP_RE = /\[LOGI_DIRECT=1\]|\[LOGI_CUSTOMER=[^\]]*\]|\[LOGI_ITEMS=[^\]]*\]/gi;

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

export function buildManualLogisticsNotes(baseNotes: string, customerName: string, itemsText: string) {
  const clean = String(baseNotes ?? "")
    .replace(STRIP_RE, "")
    .trim()
    .replace(/^\|\s*/, "")
    .replace(/\s*\|$/, "");

  const marker = `${MARKER} [LOGI_CUSTOMER=${enc(customerName)}] [LOGI_ITEMS=${enc(itemsText)}]`;
  return clean ? `${clean} | ${marker}` : marker;
}

export function parseManualLogisticsNotes(notes: string | null | undefined): ManualMeta {
  const text = String(notes ?? "");
  const isManual = text.includes(MARKER);
  const customer = text.match(CUSTOMER_RE)?.[1] ?? "";
  const items = text.match(ITEMS_RE)?.[1] ?? "";
  return {
    isManual,
    customerName: dec(customer),
    itemsText: dec(items),
  };
}

