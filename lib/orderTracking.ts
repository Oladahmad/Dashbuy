export type OrderStatus = string | null | undefined;

export type TimelineVisualState = "done" | "current" | "upcoming";

export type TrackingTimelineStep = {
  key: string;
  label: string;
  description: string;
  state: TimelineVisualState;
};

export function normalizeStatus(status: OrderStatus) {
  return String(status ?? "").trim().toLowerCase();
}

export function resolveTrackingStatus(orderStatus: OrderStatus, logisticsStatus: OrderStatus) {
  const normalizedOrderStatus = normalizeStatus(orderStatus);
  const normalizedLogisticsStatus = normalizeStatus(logisticsStatus);

  if (normalizedLogisticsStatus === "delivered") return "delivered";
  if (normalizedLogisticsStatus === "picked_up") return "picked_up";
  if (normalizedLogisticsStatus === "pending_pickup") return "pending_pickup";
  if (normalizedLogisticsStatus === "cancelled") {
    if (normalizedOrderStatus === "cancelled") return "cancelled";
    return normalizedOrderStatus || "cancelled";
  }

  if (normalizedOrderStatus === "delivered") return "delivered";
  if (normalizedOrderStatus === "picked_up") return "picked_up";
  if (normalizedOrderStatus === "pending_pickup") return "pending_pickup";
  if (normalizedOrderStatus === "accepted") return "accepted";
  if (normalizedOrderStatus === "pending_vendor") return "pending_vendor";
  if (normalizedOrderStatus === "pending_payment") return "pending_payment";
  if (normalizedOrderStatus === "rejected" || normalizedOrderStatus === "declined") return "declined";
  if (normalizedOrderStatus === "cancelled") return "cancelled";
  if (normalizedOrderStatus === "refunded") return "refunded";

  return normalizedOrderStatus || null;
}

const STANDARD_STEPS = [
  {
    key: "paid",
    label: "Payment received",
    description: "Your order has been paid for successfully.",
  },
  {
    key: "accepted",
    label: "Vendor confirmed",
    description: "The vendor has accepted your order and started processing it.",
  },
  {
    key: "pickup",
    label: "Rider at vendor",
    description: "Your rider is at the vendor for pickup.",
  },
  {
    key: "transit",
    label: "Order in transit",
    description: "Your order is on the way to you.",
  },
  {
    key: "delivered",
    label: "Delivered",
    description: "Your order has been delivered successfully.",
  },
] as const;

function standardTimeline(currentIndex: number): TrackingTimelineStep[] {
  return STANDARD_STEPS.map((step, index) => ({
    ...step,
    state: index < currentIndex ? "done" : index === currentIndex ? "current" : "upcoming",
  }));
}

export function buildTrackingTimeline(status: OrderStatus): TrackingTimelineStep[] {
  const s = normalizeStatus(status);

  if (s === "pending_payment") {
    return [
      {
        key: "pending_payment",
        label: "Awaiting payment",
        description: "We will start live order tracking as soon as payment is confirmed.",
        state: "current",
      },
    ];
  }

  if (s === "rejected" || s === "declined" || s === "refunded") {
    return [
      {
        key: "paid",
        label: "Payment received",
        description: "Your payment was confirmed successfully.",
        state: "done",
      },
      {
        key: "declined",
        label: "Order declined",
        description: "The vendor could not fulfill this order.",
        state: "done",
      },
      {
        key: "refund_wallet",
        label: "Refund sent to wallet",
        description: "Your refund has been returned to your Dashbuy wallet.",
        state: "current",
      },
    ];
  }

  if (s === "cancelled") {
    return [
      {
        key: "paid",
        label: "Payment received",
        description: "Your payment was confirmed successfully.",
        state: "done",
      },
      {
        key: "cancelled",
        label: "Order cancelled",
        description: "This order was cancelled and is no longer being processed.",
        state: "current",
      },
    ];
  }

  if (s === "pending_vendor") return standardTimeline(0);
  if (s === "accepted") return standardTimeline(1);
  if (s === "pending_pickup") return standardTimeline(2);
  if (s === "picked_up") return standardTimeline(3);
  if (s === "delivered") return standardTimeline(4).map((step) => ({ ...step, state: "done" }));

  return [
    {
      key: "tracking",
      label: "Tracking update",
      description: "We are refreshing your latest order status.",
      state: "current",
    },
  ];
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
  if (s === "pending_vendor") return "Payment received. Waiting for vendor confirmation";
  if (s === "accepted") return "Vendor confirmed your order";
  if (s === "pending_pickup") return "Rider is heading to the vendor";
  if (s === "picked_up") return "Your order is on the way";
  if (s === "delivered") return "Order delivered successfully";
  if (s === "rejected" || s === "declined") return "Order declined and refunded to wallet";
  if (s === "cancelled") return "Order cancelled";
  if (s === "refunded") return "Refund sent to wallet";
  return "Tracking update in progress";
}
