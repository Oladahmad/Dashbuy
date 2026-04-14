export const FOOD_VENDOR_ORIGIN_OPTIONS = [
  "Chips",
  "Konigba",
  "Mini Campus",
  "Mariam",
  "Oru",
  "Awa",
  "Mobarode",
  "P.S",
] as const;

export const FOOD_CUSTOMER_LOCATION_OPTIONS = [
  "Ago Market",
  "Pepsi",
  "Post Office",
  "Konigba",
  "P.S",
  "Mobarode",
  "Goodwill",
  "Koroko",
  "Mini Campus",
  "Igan Rd",
  "Palace",
  "Olopomerin",
  "Oke Ebute",
  "Abobi",
  "Itamerin",
  "Idode",
  "Mariam",
  "Townend",
  "Sabo",
  "MHS",
  "Wosam",
  "Ayegbami",
  "Oru",
  "Awa",
  "Ilaporu",
  "Ajebo",
  "Ololo",
  "Ololo-Mariam",
  "A1 Lounge",
  "St. Mary",
] as const;

export type FoodVendorOrigin = (typeof FOOD_VENDOR_ORIGIN_OPTIONS)[number];
export type FoodCustomerLocation = (typeof FOOD_CUSTOMER_LOCATION_OPTIONS)[number];

type Matrix = Record<string, Record<string, number>>;

function keyOf(value: string | null | undefined) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

const LOCATION_ALIASES: Record<string, string> = {
  [keyOf("P.S")]: "P.S",
  [keyOf("PS")]: "P.S",
  [keyOf("Post Office")]: "Post Office",
  [keyOf("Igan Road")]: "Igan Rd",
  [keyOf("Igan Rd")]: "Igan Rd",
  [keyOf("Ololo Mariam")]: "Ololo-Mariam",
  [keyOf("Ololo-Mariam")]: "Ololo-Mariam",
  [keyOf("Ololo")]: "Ololo",
  [keyOf("St Mary")]: "St. Mary",
  [keyOf("St. Mary")]: "St. Mary",
  [keyOf("Mini campus")]: "Mini Campus",
  [keyOf("Ago market")]: "Ago Market",
  [keyOf("A1 Lounge")]: "A1 Lounge",
};

function canonicalLocation(input: string | null | undefined) {
  const raw = keyOf(input);
  if (!raw) return "";
  return LOCATION_ALIASES[raw] ?? String(input ?? "").trim();
}

function build(entries: Array<[string, readonly string[]]>) {
  const out: Record<string, number> = {};
  for (const [feeText, locations] of entries) {
    const fee = Number(feeText);
    for (const location of locations) {
      out[canonicalLocation(location)] = fee;
    }
  }
  return out;
}

const DELIVERY_MATRIX: Matrix = {
  Chips: build([
    ["600", ["Ago Market", "Pepsi", "Post Office", "Konigba", "P.S", "Mobarode"]],
    ["700", ["Goodwill", "Koroko", "Mini Campus", "Igan Rd"]],
    ["800", ["Palace", "Olopomerin", "Oke Ebute", "Abobi", "Itamerin", "Idode", "Mariam", "Townend", "Sabo", "MHS", "Wosam"]],
    ["900", ["Ayegbami", "Oru", "Awa", "Ilaporu", "Ajebo"]],
  ]),
  Konigba: build([
    ["600", ["Mini Campus", "Goodwill", "Koroko", "Chips"]],
    ["700", ["Igan Rd", "Ago Market", "Pepsi", "Post Office", "Townend", "Sabo", "Wosam"]],
    ["800", ["P.S", "Mobarode", "Ololo-Mariam", "Olopomerin", "MHS", "Itamerin", "Abobi", "Idode", "Oke Ebute", "Palace"]],
    ["900", ["Ayegbami", "Oru", "Awa", "Ilaporu", "Ajebo"]],
  ]),
  "Mini Campus": build([
    ["600", ["Townend", "Sabo", "Wosam", "Konigba", "Goodwill", "Igan Rd"]],
    ["700", ["Ololo-Mariam", "Chips", "Ago Market", "Pepsi", "Post Office"]],
    ["800", ["P.S", "Mobarode", "Itamerin", "Olopomerin", "Idode", "MHS", "Abobi", "Oke Ebute", "Palace"]],
    ["900", ["Ayegbami", "Oru", "Awa", "Ilaporu", "Ajebo"]],
  ]),
  Mariam: build([
    ["600", ["Idode", "Itamerin", "MHS", "Wosam", "Ololo"]],
    ["700", ["Olopomerin", "Palace", "Oke Ebute", "Abobi", "Mini Campus", "Igan Rd"]],
    ["800", ["Townend", "Sabo", "Konigba", "Ago Market", "Pepsi", "Post Office", "Ajebo"]],
    ["900", ["Ayegbami", "Oru", "Awa", "Ilaporu", "P.S", "Mobarode"]],
  ]),
  Oru: build([
    ["600", ["Ilaporu"]],
    ["700", ["Olopomerin", "Palace", "Oke Ebute", "Abobi"]],
    ["800", ["Idode", "A1 Lounge"]],
    ["900", ["Ayegbami", "Mariam", "Townend", "Sabo", "Wosam", "Igan Rd", "Konigba", "Ago Market", "Pepsi", "Chips", "Mini Campus"]],
    ["1000", ["Townend", "Sabo", "P.S", "Mobarode"]],
  ]),
  Awa: build([
    ["600", ["Ilaporu"]],
    ["700", ["Olopomerin", "Palace", "Oke Ebute", "Abobi"]],
    ["800", ["Idode", "A1 Lounge"]],
    ["900", ["Ayegbami", "Mariam", "Townend", "Sabo", "Wosam", "Igan Rd", "Konigba", "Ago Market", "Pepsi", "Chips", "Mini Campus"]],
    ["1000", ["Townend", "Sabo", "P.S", "Mobarode"]],
  ]),
  Mobarode: build([
    ["300", ["P.S"]],
    ["500", ["Mobarode"]],
    ["600", ["Chips", "St. Mary"]],
    ["700", ["Pepsi", "Post Office"]],
    ["800", ["Ago Market", "Igan Rd", "Konigba", "Mini Campus"]],
    ["900", ["Wosam", "Ololo-Mariam", "Olopomerin", "Idode", "Palace", "Itamerin"]],
    ["1000", ["Oru", "Awa", "Townend", "Sabo"]],
  ]),
  "P.S": build([
    ["300", ["P.S"]],
    ["500", ["Mobarode"]],
    ["600", ["Chips", "St. Mary"]],
    ["700", ["Pepsi", "Post Office"]],
    ["800", ["Ago Market", "Igan Rd", "Konigba", "Mini Campus"]],
    ["900", ["Wosam", "Ololo-Mariam", "Olopomerin", "Idode", "Palace", "Itamerin"]],
    ["1000", ["Oru", "Awa", "Townend", "Sabo"]],
  ]),
};

export function normalizeFoodVendorOrigin(value: string | null | undefined) {
  const canonical = canonicalLocation(value);
  return FOOD_VENDOR_ORIGIN_OPTIONS.find((option) => canonicalLocation(option) === canonical) ?? null;
}

export function normalizeFoodCustomerLocation(value: string | null | undefined) {
  const canonical = canonicalLocation(value);
  return FOOD_CUSTOMER_LOCATION_OPTIONS.find((option) => canonicalLocation(option) === canonical) ?? null;
}

export function getFoodDeliveryFee(origin: string | null | undefined, destination: string | null | undefined) {
  const from = normalizeFoodVendorOrigin(origin);
  const to = normalizeFoodCustomerLocation(destination);
  if (!from || !to) return null;
  return DELIVERY_MATRIX[from]?.[to] ?? null;
}
