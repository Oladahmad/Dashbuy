export function extractOrderNameFromNotes(notes: string | null | undefined): string {
  const text = (notes ?? "").trim();
  if (!text) return "";
  const match = text.match(/Order name:\s*([^|]+)/i);
  return match?.[1]?.trim() ?? "";
}

export function fallbackFoodOrderName(itemNames: string[]): string {
  const clean = itemNames.map((x) => x.trim()).filter(Boolean);
  if (clean.length === 0) return "Food order";
  const unique = Array.from(new Set(clean));
  if (unique.length === 1) return `${unique[0]} order`;
  if (unique.length === 2) return `${unique[0]} and ${unique[1]} order`;
  return `${unique[0]}, ${unique[1]} and more`;
}
