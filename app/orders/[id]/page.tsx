"use client";

import { useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import OrderTimeline from "@/components/OrderTimeline";
import { supabase } from "@/lib/supabaseClient";
import { resolveTrackingStatus } from "@/lib/orderTracking";
import { useParams, useRouter } from "next/navigation";
import { extractOrderNameFromNotes } from "@/lib/orderName";
import { parseErrandQuote } from "@/lib/errandQuote";
import { parseManualLogisticsNotes } from "@/lib/manualLogistics";

type OrderRow = {
  id: string;
  order_type: "food" | "product";
  food_mode: "plate" | "combo" | null;
  status: string | null;
  delivery_address: string | null;
  subtotal: number | null;
  delivery_fee: number | null;
  total: number | null;
  created_at: string;
  paystack_reference: string | null;
  vendor_id: string;
  customer_id: string;
  notes: string | null;
};

type OrderSummary = {
  id: string;
  order_type: "food" | "product" | "mixed";
  food_mode: "plate" | "combo" | null;
  status: string | null;
  delivery_address: string | null;
  subtotal: number;
  delivery_fee: number;
  total: number;
  created_at: string;
  paystack_reference: string | null;
  customer_id: string;
  orderIds: string[];
  orderName: string;
  errandQuoteState: "none" | "pending" | "quoted" | "approved";
};

type VendorTrackingCard = {
  orderId: string;
  vendorId: string;
  vendorName: string;
  status: string | null;
  total: number;
  orderType: "food" | "product";
  foodMode: "plate" | "combo" | null;
  riderMapUrl: string;
};

type VendorProfile = {
  id: string;
  store_name: string | null;
  full_name: string | null;
};

type ProductItemRow = {
  id: string;
  qty: number | null;
  unit_price: number | null;
  line_total: number | null;
  products: { id: string; name: string } | null;
};

type ComboItemRow = {
  id: string;
  qty: number | null;
  unit_price: number | null;
  line_total: number | null;
  food_items: { id: string; name: string } | null;
};

type PlateItemRow = {
  id: string;
  qty: number | null;
  unit_price: number | null;
  line_total: number | null;
  food_items: { id: string; name: string } | null;
  food_item_variants: { id: string; name: string } | null;
};

function naira(n: number) {
  return `₦${Math.round(Number(n) || 0).toLocaleString()}`;
}

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function safeNumber(x: unknown, fallback = 0) {
  if (typeof x === "number" && Number.isFinite(x)) return x;
  const n = Number(x);
  return Number.isFinite(n) ? n : fallback;
}

function labelForOrder(o: OrderRow) {
  if (o.order_type === "product") return "Products order";
  if ((o.food_mode ?? "plate") === "combo") return "Food combo order";
  return "Food plate order";
}

function labelForSummary(o: OrderSummary) {
  if (o.orderName.trim()) return o.orderName;
  if (o.order_type === "mixed") return "Combined order";
  if (o.order_type === "product") return "Products order";
  if ((o.food_mode ?? "plate") === "combo") return "Food combo order";
  return "Food plate order";
}

function groupStatus(orders: OrderRow[]) {
  const statuses = orders.map((o) => (o.status ?? "").toLowerCase());
  if (statuses.includes("pending_payment")) return "pending_payment";
  if (statuses.includes("pending_vendor")) return "pending_vendor";
  if (statuses.includes("accepted")) return "accepted";
  if (statuses.includes("pending_pickup")) return "pending_pickup";
  if (statuses.includes("picked_up")) return "picked_up";
  if (statuses.every((s) => s === "delivered")) return "delivered";
  if (statuses.includes("rejected") || statuses.includes("declined")) return "declined";
  if (statuses.includes("cancelled")) return "cancelled";
  if (statuses.includes("refunded")) return "refunded";
  return orders[0]?.status ?? null;
}

function summarizeOrders(orders: OrderRow[]): OrderSummary {
  const sorted = [...orders].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const first = sorted[0];
  const types = Array.from(new Set(sorted.map((o) => o.order_type)));
  const orderType = types.length > 1 ? "mixed" : first.order_type;
  const foodModes = Array.from(new Set(sorted.map((o) => o.food_mode).filter(Boolean)));

  return {
    id: first.id,
    order_type: orderType,
    food_mode: orderType === "food" && foodModes.length === 1 ? (foodModes[0] as "plate" | "combo") : null,
    status: groupStatus(sorted),
    delivery_address: first.delivery_address,
    subtotal: sorted.reduce((sum, row) => sum + safeNumber(row.subtotal), 0),
    delivery_fee: sorted.reduce((sum, row) => sum + safeNumber(row.delivery_fee), 0),
    total: sorted.reduce((sum, row) => sum + safeNumber(row.total), 0),
    created_at: first.created_at,
    paystack_reference: first.paystack_reference,
    customer_id: first.customer_id,
    orderIds: sorted.map((row) => row.id),
    orderName:
      sorted.map((row) => extractOrderNameFromNotes(row.notes)).find((name) => name.length > 0) ?? "",
    errandQuoteState: (() => {
      const states = sorted
        .map((row) => parseErrandQuote(row.notes))
        .filter((meta) => meta.isErrand)
        .map((meta) => meta.status ?? "pending");
      if (states.length === 0) return "none";
      if (states.includes("pending")) return "pending";
      if (states.includes("quoted")) return "quoted";
      return "approved";
    })(),
  };
}

export default function OrderDetailsPage() {
  const router = useRouter();
  const params = useParams();
  const id = String((params as { id?: string })?.id ?? "");

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  const [order, setOrder] = useState<OrderSummary | null>(null);

  const [vendorNames, setVendorNames] = useState<Record<string, string>>({});

  const [productItems, setProductItems] = useState<ProductItemRow[]>([]);
  const [comboItems, setComboItems] = useState<ComboItemRow[]>([]);
  const [plateItems, setPlateItems] = useState<PlateItemRow[]>([]);
  const [vendorTracking, setVendorTracking] = useState<VendorTrackingCard[]>([]);
  const [approvingQuote, setApprovingQuote] = useState(false);
  const [openingPayment, setOpeningPayment] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setMsg("");

      setOrder(null);
      setVendorNames({});
      setProductItems([]);
      setComboItems([]);
      setPlateItems([]);
      setVendorTracking([]);

      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData.session?.user;
      if (!user) {
        router.push("/auth/login");
        return;
      }

      const { data: o, error: oErr } = await supabase
        .from("orders")
        .select(
          "id,order_type,food_mode,status,delivery_address,subtotal,delivery_fee,total,created_at,paystack_reference,vendor_id,customer_id,notes"
        )
        .eq("id", id)
        .eq("customer_id", user.id)
        .single();

      if (oErr) {
        setMsg(oErr.message);
        setLoading(false);
        return;
      }

      const baseOrder = o as OrderRow;
      let relatedOrders = [baseOrder];

      if (baseOrder.paystack_reference) {
        const { data: siblings, error: siblingsErr } = await supabase
          .from("orders")
          .select(
            "id,order_type,food_mode,status,delivery_address,subtotal,delivery_fee,total,created_at,paystack_reference,vendor_id,customer_id,notes"
          )
          .eq("customer_id", user.id)
          .eq("paystack_reference", baseOrder.paystack_reference)
          .order("created_at", { ascending: true });

        if (siblingsErr) {
          setMsg(siblingsErr.message);
          setLoading(false);
          return;
        }

        if (siblings && siblings.length > 0) {
          relatedOrders = siblings as OrderRow[];
        }
      }

      const relatedOrderIds = relatedOrders.map((row) => row.id);
      const { data: jobs } = await supabase.from("logistics_jobs").select("order_id,status").in("order_id", relatedOrderIds);
      const jobsByOrderId = new Map(
        ((jobs ?? []) as Array<{ order_id: string; status: string | null }>).map((job) => [job.order_id, job.status ?? null])
      );

      const resolvedOrders = relatedOrders.map((row) => ({
        ...row,
        status: resolveTrackingStatus(row.status, jobsByOrderId.get(row.id) ?? null),
      }));
      setOrder(summarizeOrders(resolvedOrders));

      const vendorIds = Array.from(new Set(resolvedOrders.map((row) => row.vendor_id)));
      const { data: profiles, error: profilesErr } = await supabase
        .from("profiles")
        .select("id,store_name,full_name")
        .in("id", vendorIds);

      if (!profilesErr && profiles) {
        const nextNames: Record<string, string> = {};
        for (const profile of profiles as VendorProfile[]) {
          nextNames[profile.id] = profile.store_name || profile.full_name || "Vendor";
        }
        setVendorNames(nextNames);
        setVendorTracking(
          resolvedOrders.map((row) => {
            const manual = parseManualLogisticsNotes(row.notes);
            return {
              orderId: row.id,
              vendorId: row.vendor_id,
              vendorName: nextNames[row.vendor_id] || "Vendor",
              status: row.status,
              total: safeNumber(row.total),
              orderType: row.order_type,
              foodMode: row.food_mode,
              riderMapUrl: manual.riderMapUrl || "",
            };
          })
        );
      } else {
        setVendorTracking(
          resolvedOrders.map((row) => {
            const manual = parseManualLogisticsNotes(row.notes);
            return {
              orderId: row.id,
              vendorId: row.vendor_id,
              vendorName: "Vendor",
              status: row.status,
              total: safeNumber(row.total),
              orderType: row.order_type,
              foodMode: row.food_mode,
              riderMapUrl: manual.riderMapUrl || "",
            };
          })
        );
      }

      const productOrderIds = resolvedOrders.filter((row) => row.order_type === "product").map((row) => row.id);
      if (productOrderIds.length > 0) {
        const { data: it, error: itErr } = await supabase
          .from("order_items")
          .select("id,qty,unit_price,line_total,order_id,products:product_id(id,name)")
          .in("order_id", productOrderIds);

        if (itErr) {
          setMsg(itErr.message);
          setLoading(false);
          return;
        }

        setProductItems((it as unknown as ProductItemRow[]) ?? []);
      }

      const foodOrderIds = resolvedOrders.filter((row) => row.order_type === "food").map((row) => row.id);
      if (foodOrderIds.length === 0) {
        setLoading(false);
        return;
      }

      const { data: comboRows, error: comboErr } = await supabase
        .from("combo_order_items")
        .select("id,qty,unit_price,line_total,order_id,food_items:combo_food_id(id,name)")
        .in("order_id", foodOrderIds);

      if (comboErr) {
        setMsg(comboErr.message);
        setLoading(false);
        return;
      }

      const comboList = (comboRows as unknown as ComboItemRow[]) ?? [];
      setComboItems(comboList);
      const comboAsPlate: PlateItemRow[] = comboList.map((it) => ({
        id: `combo-${it.id}`,
        qty: it.qty,
        unit_price: it.unit_price,
        line_total: it.line_total,
        food_items: it.food_items,
        food_item_variants: null,
      }));

      const { data: plates, error: pErr } = await supabase
        .from("order_plates")
        .select("id,order_id")
        .in("order_id", foodOrderIds);

      if (pErr) {
        setMsg(pErr.message);
        setLoading(false);
        return;
      }

      const plateRows = (plates as { id: string }[]) ?? [];
      const plateIds = plateRows.map((x) => x.id);

      if (plateIds.length > 0) {
        const { data: pit, error: pitErr } = await supabase
          .from("order_plate_items")
          .select(
            "id,qty,unit_price,line_total,food_items:food_item_id(id,name),food_item_variants:variant_id(id,name)"
          )
          .in("order_plate_id", plateIds);

        if (pitErr) {
          setMsg(pitErr.message);
          setLoading(false);
          return;
        }

        const plateList = (pit as unknown as PlateItemRow[]) ?? [];
        setPlateItems([...plateList, ...comboAsPlate]);
      } else {
        setPlateItems(comboAsPlate);
      }
      setLoading(false);
    })();
  }, [id, router]);

  useEffect(() => {
    if (!id) return;

    let alive = true;

    async function refreshTracking() {
      if (!order?.orderIds.length) return;

      const { data: o } = await supabase.from("orders").select("id,status").in("id", order.orderIds);
      const { data: j } = await supabase.from("logistics_jobs").select("order_id,status").in("order_id", order.orderIds);

      if (!alive) return;

      const logisticsByOrderId = new Map(
        ((j ?? []) as Array<{ order_id: string; status: string | null }>).map((row) => [row.order_id, row.status ?? null])
      );
      const refreshedOrders = ((o ?? []) as Array<{ id: string; status: string | null }>).map((row) => ({
        id: row.id,
        status: resolveTrackingStatus(row.status, logisticsByOrderId.get(row.id) ?? null),
      }));
      const statusById = new Map(refreshedOrders.map((row) => [row.id, row.status]));

      setOrder((prev) => {
        if (!prev) return prev;
        const fakeRows = prev.orderIds.map((orderId) => ({
          id: orderId,
          order_type: prev.order_type === "mixed" ? "product" : prev.order_type,
          food_mode: prev.food_mode,
          status: statusById.get(orderId) ?? prev.status,
          delivery_address: prev.delivery_address,
          subtotal: 0,
          delivery_fee: 0,
          total: 0,
          created_at: prev.created_at,
          paystack_reference: prev.paystack_reference,
          vendor_id: "",
          customer_id: prev.customer_id,
          notes: null,
        }));
        return { ...prev, status: groupStatus(fakeRows) };
      });
      setVendorTracking((prev) =>
        prev.map((item) => ({
          ...item,
          status: statusById.get(item.orderId) ?? item.status,
        }))
      );
    }

    const channel = supabase
      .channel(`order-tracking-customer-${id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "orders", filter: `id=eq.${id}` }, refreshTracking)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "logistics_jobs", filter: `order_id=eq.${id}` },
        refreshTracking
      )
      .subscribe();

    const timer = setInterval(refreshTracking, 15000);

    return () => {
      alive = false;
      clearInterval(timer);
      supabase.removeChannel(channel);
    };
  }, [id, order?.customer_id, order?.created_at, order?.delivery_address, order?.food_mode, order?.orderIds, order?.order_type, order?.paystack_reference, order?.status]);

  const grouped = useMemo(() => {
    if (!order) return [];
    const vendorEntries = Object.entries(vendorNames);
    const vendor = vendorEntries.length === 1 ? vendorEntries[0][1] : "Vendors";

    if (order.order_type === "product") return [[vendor, productItems]] as [string, ProductItemRow[]][];
    if (order.order_type === "food" && (order.food_mode ?? "plate") === "combo")
      return [[vendor, comboItems]] as [string, ComboItemRow[]][];
    return [[vendor, plateItems]] as [string, PlateItemRow[]][];
  }, [order, vendorNames, productItems, comboItems, plateItems]);

  const paymentQuery = useMemo(() => {
    if (!order) return "";
    return order.orderIds.length > 1
      ? `/food/pay?orderIds=${encodeURIComponent(order.orderIds.join(","))}`
      : `/food/pay?orderId=${encodeURIComponent(order.id)}`;
  }, [order]);

  async function approveQuoteAndPay() {
    if (!order) return;
    setApprovingQuote(true);
    setMsg("");

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setApprovingQuote(false);
      router.push("/auth/login?next=%2Forders");
      return;
    }

    const res = await fetch("/api/orders/approve-quote", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ orderIds: order.orderIds }),
    });
    const body = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
    if (!res.ok || !body?.ok) {
      setApprovingQuote(false);
      setMsg(body?.error ?? "Failed to approve quote.");
      return;
    }

    setApprovingQuote(false);
    await continuePayment();
  }

  async function continuePayment() {
    if (!order) return;
    setOpeningPayment(true);
    setMsg("");

    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData.session;
    const token = session?.access_token;
    const email = session?.user?.email?.trim() ?? "";
    if (!token || !email) {
      setOpeningPayment(false);
      router.push("/auth/login?next=%2Forders");
      return;
    }

    const res = await fetch("/api/paystack/initialize", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        orderId: order.orderIds.length === 1 ? order.id : undefined,
        orderIds: order.orderIds,
        email,
      }),
    });
    const body = (await res.json().catch(() => null)) as { ok?: boolean; error?: string; authorization_url?: string } | null;
    if (!res.ok || !body?.ok || !body.authorization_url) {
      setOpeningPayment(false);
      setMsg(body?.error ?? "Unable to continue payment.");
      return;
    }

    window.location.href = body.authorization_url;
  }

  return (
    <AppShell title="Order details">
      <button className="rounded-xl border px-4 py-2 bg-white" onClick={() => router.push("/orders")} type="button">
        ← Back to orders
      </button>

      {msg ? (
        <div className="mt-4 rounded-2xl border bg-white p-4 text-sm text-red-600">{msg}</div>
      ) : null}

      {loading ? (
        <div className="mt-4 rounded-2xl border bg-white p-5 text-sm text-gray-600">Loading order...</div>
      ) : !order ? (
        <div className="mt-4 rounded-2xl border bg-white p-5 text-sm text-gray-600">Order not found.</div>
      ) : (
        <>
          <div className="mt-4 rounded-2xl border bg-white p-5">
            <div className="flex items-center justify-between">
              <p className="text-lg font-semibold">{labelForSummary(order)}</p>
              <span className="rounded-full border px-3 py-1 text-sm">{order.status ?? "unknown"}</span>
            </div>

            <p className="mt-2 text-sm text-gray-600">Date: {fmtDate(order.created_at)}</p>

            <p className="mt-2 text-sm text-gray-600">
              Address: <span className="text-gray-900">{order.delivery_address ?? "Not provided"}</span>
            </p>

            {order.paystack_reference ? <p className="mt-2 text-xs text-gray-500">Ref: {order.paystack_reference}</p> : null}
            {order.orderIds.length > 1 ? (
              <p className="mt-2 text-xs text-gray-500">{order.orderIds.length} vendor orders combined in this purchase</p>
            ) : null}
            {(order.status ?? "").toLowerCase() === "pending_payment" && order.errandQuoteState === "quoted" ? (
              <button
                type="button"
                className="mt-4 rounded-xl bg-black px-4 py-2 text-sm text-white disabled:opacity-60"
                onClick={approveQuoteAndPay}
                disabled={approvingQuote}
              >
                {approvingQuote ? "Approving..." : "Approve quote & continue payment"}
              </button>
            ) : null}
            {(order.status ?? "").toLowerCase() === "pending_payment" && order.errandQuoteState === "pending" ? (
              <p className="mt-4 text-sm text-gray-600">
                Awaiting final quote from admin. Payment will open once quote is sent.
              </p>
            ) : null}
            {(order.status ?? "").toLowerCase() === "pending_payment" &&
            (order.errandQuoteState === "none" || order.errandQuoteState === "approved") ? (
              <button
                type="button"
                className="mt-4 rounded-xl bg-black px-4 py-2 text-sm text-white"
                onClick={() => void continuePayment()}
                disabled={openingPayment}
              >
                {openingPayment ? "Opening payment..." : "Continue payment"}
              </button>
            ) : null}
          </div>

          <div className="mt-4 rounded-2xl border bg-white p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-lg font-semibold">Vendor tracking</p>
                <p className="mt-1 text-sm text-gray-600">Each vendor order is tracked separately in real time.</p>
              </div>
              <span className="rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1 text-xs text-gray-600">
                {vendorTracking.length} live monitor{vendorTracking.length === 1 ? "" : "s"}
              </span>
            </div>

            <div className="mt-4 grid gap-3">
              {vendorTracking.map((item) => (
                <div key={item.orderId} className="space-y-2">
                  <OrderTimeline
                    status={item.status}
                    title={item.vendorName}
                    subtitle={`${item.orderType === "product" ? "Product order" : "Food order"} · ${naira(item.total)} · Ref ${item.orderId.slice(0, 8)}`}
                  />
                  {String(item.status ?? "").toLowerCase() === "picked_up" && /^https?:\/\//i.test(item.riderMapUrl) ? (
                    <a
                      href={item.riderMapUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex rounded-xl border px-3 py-2 text-sm font-medium"
                    >
                      Track rider live on Google Maps
                    </a>
                  ) : null}
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 rounded-2xl border bg-white p-5">
            <p className="text-lg font-semibold">Items</p>

            <div className="mt-3 grid gap-4">
              {grouped.map(([vendor, list]) => (
                <div key={vendor} className="rounded-2xl border p-4">
                  <p className="font-semibold">{vendor}</p>

                  <div className="mt-3 grid gap-2">
                    {order.order_type === "product"
                      ? (list as ProductItemRow[]).map((it) => {
                          const qty = safeNumber(it.qty, 1);
                          const unit = safeNumber(it.unit_price, 0);
                          const total = safeNumber(it.line_total, unit * qty);
                          const name = it.products?.name ?? "Item";
                          return (
                            <div key={it.id} className="flex justify-between text-sm">
                              <span>
                                {name} × {qty} <span className="text-gray-500">({naira(unit)} each)</span>
                              </span>
                              <span className="font-medium">{naira(total)}</span>
                            </div>
                          );
                        })
                      : (order.food_mode ?? "plate") === "combo"
                      ? (list as ComboItemRow[]).map((it) => {
                          const qty = safeNumber(it.qty, 1);
                          const unit = safeNumber(it.unit_price, 0);
                          const total = safeNumber(it.line_total, unit * qty);
                          const name = it.food_items?.name ?? "Combo item";
                          return (
                            <div key={it.id} className="flex justify-between text-sm">
                              <span>
                                {name} × {qty} <span className="text-gray-500">({naira(unit)} each)</span>
                              </span>
                              <span className="font-medium">{naira(total)}</span>
                            </div>
                          );
                        })
                      : (list as PlateItemRow[]).map((it) => {
                          const qty = safeNumber(it.qty, 1);
                          const unit = safeNumber(it.unit_price, 0);
                          const total = safeNumber(it.line_total, unit * qty);
                          const base = it.food_items?.name ?? "Food item";
                          const variant = it.food_item_variants?.name ?? "";
                          const name = variant ? `${base} · ${variant}` : base;
                          return (
                            <div key={it.id} className="flex justify-between text-sm">
                              <span>
                                {name} × {qty} <span className="text-gray-500">({naira(unit)} each)</span>
                              </span>
                              <span className="font-medium">{naira(total)}</span>
                            </div>
                          );
                        })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 rounded-2xl border bg-white p-5">
            <div className="flex justify-between text-sm">
              <span>Subtotal</span>
              <span>{naira(order.subtotal ?? 0)}</span>
            </div>
            <div className="mt-2 flex justify-between text-sm">
              <span>Delivery</span>
              <span>{naira(order.delivery_fee ?? 0)}</span>
            </div>
            <div className="mt-3 flex justify-between text-lg font-bold">
              <span>Total</span>
              <span>{naira(order.total ?? 0)}</span>
            </div>
          </div>
        </>
      )}
    </AppShell>
  );
}

