export type OrderStatus = string | null | undefined;

export function normalizeStatus(status: OrderStatus) {
  return String(status ?? "").trim().toLowerCase();
}

export function resolveTrackingStatus(orderStatus: OrderStatus, logisticsStatus: OrderStatus) {
  const o = normalizeStatus(orderStatus);
  const l = normalizeStatus(logisticsStatus);

  if (l === "delivered") return "delivered";
  if (l === "picked_up") return "picked_up";
  if (l === "pending_pickup" && (o === "accepted" || o === "pending_vendor" || o === "pending_pickup")) {
    return "pending_pickup";
  }

  return o || "pending_payment";
}

export function trackingStepIndex(status: OrderStatus) {
  const s = normalizeStatus(status);
  if (s === "delivered") return 3;
  if (s === "picked_up") return 2;
  if (s === "accepted" || s === "pending_pickup") return 1;
  if (s === "pending_vendor") return 0;
  if (s === "pending_payment") return -1;
  if (["rejected", "declined", "cancelled", "refunded"].includes(s)) return -2;
  return -1;
}

export function trackingSummary(status: OrderStatus) {
  const s = normalizeStatus(status);
  if (s === "pending_payment") return "Waiting for payment";
  if (s === "pending_vendor") return "Payment received. Waiting for vendor acceptance";
  if (s === "accepted") return "Vendor accepted. Preparing handoff";
  if (s === "pending_pickup") return "Rider assigned. Waiting for pickup";
  if (s === "picked_up") return "Order picked up and on the way";
  if (s === "delivered") return "Order delivered successfully";
  if (s === "rejected" || s === "declined") return "Order was declined by vendor";
  if (s === "cancelled") return "Order was cancelled";
  if (s === "refunded") return "Order was refunded";
  return "Tracking update in progress";
}
