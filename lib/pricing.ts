export const CUSTOMER_SERVICE_FEE_RATE = 0.05;
export const CUSTOMER_SERVICE_FEE_CAP = 500;
export const VENDOR_COMMISSION_RATE = 0.05;
export const VENDOR_TRIAL_DELIVERED_ORDERS = 50;

type MoneyLikeOrder = {
  subtotal?: number | null;
  total?: number | null;
  total_amount?: number | null;
  delivery_fee?: number | null;
};

type VendorPricingOrder = MoneyLikeOrder & {
  id: string;
  created_at: string;
  status: string | null;
};

function asNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function calculateServiceFee(subtotal: number) {
  const base = Math.max(0, Math.round(asNumber(subtotal)));
  if (base <= 0) return 0;
  return Math.min(CUSTOMER_SERVICE_FEE_CAP, Math.round(base * CUSTOMER_SERVICE_FEE_RATE));
}

export function calculateCustomerOrderTotal(subtotal: number, deliveryFee: number) {
  const cleanSubtotal = Math.max(0, Math.round(asNumber(subtotal)));
  const cleanDeliveryFee = Math.max(0, Math.round(asNumber(deliveryFee)));
  const serviceFee = calculateServiceFee(cleanSubtotal);
  return {
    subtotal: cleanSubtotal,
    deliveryFee: cleanDeliveryFee,
    serviceFee,
    total: cleanSubtotal + cleanDeliveryFee + serviceFee,
  };
}

export function commissionBaseFromOrder(order: MoneyLikeOrder) {
  const subtotal = Math.max(0, Math.round(asNumber(order.subtotal)));
  if (subtotal > 0) return subtotal;
  const total = Math.max(0, Math.round(asNumber(order.total_amount ?? order.total)));
  const deliveryFee = Math.max(0, Math.round(asNumber(order.delivery_fee)));
  return Math.max(0, total - deliveryFee);
}

export function vendorCommissionRateForDeliveredCount(deliveredBeforeCount: number) {
  return deliveredBeforeCount >= VENDOR_TRIAL_DELIVERED_ORDERS ? VENDOR_COMMISSION_RATE : 0;
}

export function calculateVendorCommission(baseAmount: number, deliveredBeforeCount: number) {
  const cleanBase = Math.max(0, Math.round(asNumber(baseAmount)));
  const rate = vendorCommissionRateForDeliveredCount(deliveredBeforeCount);
  return Math.round(cleanBase * rate);
}

export function calculateVendorNet(baseAmount: number, deliveredBeforeCount: number) {
  const cleanBase = Math.max(0, Math.round(asNumber(baseAmount)));
  const commission = calculateVendorCommission(cleanBase, deliveredBeforeCount);
  return Math.max(0, cleanBase - commission);
}

export function buildVendorPricingMap<T extends VendorPricingOrder>(orders: T[]) {
  const sorted = [...orders].sort((a, b) => {
    const byDate = String(a.created_at).localeCompare(String(b.created_at));
    if (byDate !== 0) return byDate;
    return String(a.id).localeCompare(String(b.id));
  });

  const pricingByOrderId: Record<
    string,
    {
      gross: number;
      commission: number;
      net: number;
      deliveredBeforeCount: number;
      commissionRate: number;
    }
  > = {};

  let deliveredCount = 0;

  for (const order of sorted) {
    const gross = commissionBaseFromOrder(order);
    const deliveredBeforeCount = deliveredCount;
    const commission = calculateVendorCommission(gross, deliveredBeforeCount);
    const net = Math.max(0, gross - commission);
    const commissionRate = vendorCommissionRateForDeliveredCount(deliveredBeforeCount);

    pricingByOrderId[order.id] = {
      gross,
      commission,
      net,
      deliveredBeforeCount,
      commissionRate,
    };

    if (String(order.status ?? "").toLowerCase() === "delivered") {
      deliveredCount += 1;
    }
  }

  return pricingByOrderId;
}
