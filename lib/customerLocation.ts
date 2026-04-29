export type CustomerLocationMeta = {
  lat: number | null;
  lng: number | null;
  accuracyMeters: number | null;
  capturedAt: string | null;
};

export function buildCustomerPinUrl(location: Pick<CustomerLocationMeta, "lat" | "lng">) {
  if (!Number.isFinite(location.lat) || !Number.isFinite(location.lng)) return null;
  return `https://www.google.com/maps/dir/?api=1&destination=${location.lat},${location.lng}`;
}
