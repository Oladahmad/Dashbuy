"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import OrderTimeline from "@/components/OrderTimeline";
import { resolveTrackingStatus } from "@/lib/orderTracking";

type OrderRow = {
  id: string;
  order_type: "food" | "product";
  food_mode: "plate" | "combo" | null;
  customer_id: string;
  vendor_id: string;
  status: string | null;
  subtotal: number | null;
  delivery_fee: number | null;
  total: number | null;
  total_amount: number | null;
  delivery_address: string | null;
  customer_phone: string | null;
  notes: string | null;
  paystack_reference: string | null;
  created_at: string;
};

type OrderPlateRow = {
  id: string;
  order_id: string;
};

type ProductItemRow = {
  id: string;
  qty: number | null;
  unit_price: number | null;
  line_total: number | null;
  products: { id: string; name: string; image_path: string | null; price: number } | null;
};

type ComboItemRow = {
  id: string;
  qty: number;
  unit_price: number;
  line_total: number;
  food_items: { id: string; name: string; image_url: string | null } | null;
};

type PlateItemRow = {
  id: string;
  qty: number | null;
  unit_price: number | null;
  line_total: number | null;
  food_items: { id: string; name: string; image_url: string | null } | null;
  food_item_variants: { id: string; name: string } | null;
};

function safeNumber(x: unknown, fallback = 0) {
  if (typeof x === "number" && Number.isFinite(x)) return x;
  if (typeof x === "string") {
    const n = Number(x);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

function formatNaira(n: number) {
  const v = Math.max(0, Math.floor(n));
  return "₦" + v.toLocaleString();
}

function formatDateTime(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function computeGross(o: OrderRow) {
  const subtotal = safeNumber(o.subtotal, 0);
  if (subtotal > 0) return subtotal;
  const total = safeNumber(o.total_amount ?? o.total, 0);
  const delivery = safeNumber(o.delivery_fee, 0);
  return Math.max(0, total - delivery);
}

function computeVendorFee(gross: number) {
  return Math.round(gross * 0.05);
}

function computeVendorNet(gross: number) {
  return Math.max(0, gross - computeVendorFee(gross));
}

function lineTotal(qty: number, unit: number) {
  return Math.max(0, Math.round(qty * unit));
}

function canVendorAct(status: string | null) {
  return status === "pending_vendor";
}

function friendlyStatus(status: string | null) {
  const s = (status ?? "").toLowerCase();
  if (s === "pending_payment") return "Awaiting customer payment";
  if (s === "pending_vendor") return "Pending your confirmation";
  if (s === "accepted") return "Accepted by vendor";
  if (s === "pending_pickup") return "Waiting rider pickup";
  if (s === "picked_up") return "Picked up by rider";
  if (s === "delivered") return "Delivered";
  if (s === "rejected" || s === "declined") return "Declined";
  if (s === "cancelled") return "Cancelled";
  if (s === "refunded") return "Refunded";
  return status ?? "Unknown";
}

function settlementText(status: string | null) {
  const s = (status ?? "").toLowerCase();
  if (s === "delivered") return "Settled and withdrawable";
  if (s === "pending_vendor") return "Pending your confirmation";
  if (s === "accepted" || s === "pending_pickup" || s === "picked_up") return "Await logistics confirmation";
  if (s === "pending_payment") return "Awaiting customer payment";
  return "Not settled";
}

export default function VendorOrderDetailsPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;

  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [err, setErr] = useState<string | null>(null);
  const [order, setOrder] = useState<OrderRow | null>(null);

  const [productItems, setProductItems] = useState<ProductItemRow[]>([]);
  const [comboItems, setComboItems] = useState<ComboItemRow[]>([]);
  const [plateItems, setPlateItems] = useState<PlateItemRow[]>([]);
  const [itemsNote, setItemsNote] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    async function load() {
      setLoading(true);
      setErr(null);
      setItemsNote(null);
      setProductItems([]);
      setComboItems([]);
      setPlateItems([]);

      const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
      const session = sessionData.session;

      if (!session || sessionErr) {
        if (alive) {
          setErr("Not signed in");
          setLoading(false);
        }
        return;
      }

      const userId = session.user.id;

      const one = await supabase
        .from("orders")
        .select(
          "id,order_type,food_mode,customer_id,vendor_id,status,subtotal,delivery_fee,total,total_amount,delivery_address,customer_phone,notes,paystack_reference,created_at"
        )
        .eq("id", id)
        .maybeSingle<OrderRow>();

      if (!alive) return;

      if (one.error) {
        setErr(one.error.message);
        setOrder(null);
        setLoading(false);
        return;
      }

      if (!one.data) {
        setErr("Order not found");
        setOrder(null);
        setLoading(false);
        return;
      }

      if (one.data.vendor_id !== userId) {
        setErr("You do not have access to this order");
        setOrder(null);
        setLoading(false);
        return;
      }

      const o = one.data;
      const { data: job } = await supabase
        .from("logistics_jobs")
        .select("status")
        .eq("order_id", o.id)
        .maybeSingle<{ status: string | null }>();

      const effectiveStatus = resolveTrackingStatus(o.status, job?.status ?? null);
      setOrder({ ...o, status: effectiveStatus });

      if (o.order_type === "product") {
        const r = await supabase
          .from("order_items")
          .select("id,qty,unit_price,line_total,products:product_id(id,name,image_path,price)")
          .eq("order_id", o.id);

        if (r.error) {
          setItemsNote(r.error.message);
        } else {
          const rows = (r.data ?? []) as unknown as ProductItemRow[];
          setProductItems(rows);
          if (rows.length === 0) setItemsNote("No items found");
        }
      }

      if (o.order_type === "food") {
        const comboRes = await supabase
          .from("combo_order_items")
          .select("id,qty,unit_price,line_total,food_items:combo_food_id(id,name,image_url)")
          .eq("order_id", o.id);

        if (comboRes.error) {
          setItemsNote(comboRes.error.message);
        } else {
          const comboRows = (comboRes.data ?? []) as unknown as ComboItemRow[];
          setComboItems(comboRows);
          const comboAsPlate: PlateItemRow[] = comboRows.map((it) => ({
            id: `combo-${it.id}`,
            qty: it.qty,
            unit_price: it.unit_price,
            line_total: it.line_total,
            food_items: it.food_items,
            food_item_variants: null,
          }));

          const plates = await supabase.from("order_plates").select("id,order_id").eq("order_id", o.id);
          if (plates.error) {
            setItemsNote(plates.error.message);
          } else {
            const plateRows = (plates.data ?? []) as OrderPlateRow[];
            if (plateRows.length === 0) {
              if ((o.food_mode ?? "plate") === "combo") {
                if (comboRows.length === 0) setItemsNote("No items found");
              } else {
                setPlateItems(comboAsPlate);
                if (comboAsPlate.length === 0) setItemsNote("No items found");
              }
            } else {
              const plateIds = plateRows.map((p) => p.id);
              const r = await supabase
                .from("order_plate_items")
                .select(
                  "id,qty,unit_price,line_total,food_items:food_item_id(id,name,image_url),food_item_variants:variant_id(id,name)"
                )
                .in("order_plate_id", plateIds);

              if (r.error) {
                setItemsNote(r.error.message);
              } else {
                const rows = (r.data ?? []) as unknown as PlateItemRow[];
                const merged = (o.food_mode ?? "plate") === "combo" ? rows : [...rows, ...comboAsPlate];
                setPlateItems(merged);
                if (merged.length === 0 && comboRows.length === 0) setItemsNote("No items found");
              }
            }
          }
        }
      }

      setLoading(false);
    }

    if (id) load();

    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      if (id) load();
    });

    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, [id]);

  useEffect(() => {
    if (!id) return;

    let alive = true;

    async function refreshTracking() {
      const { data: o } = await supabase.from("orders").select("status").eq("id", id).maybeSingle<{ status: string | null }>();
      const { data: j } = await supabase
        .from("logistics_jobs")
        .select("status")
        .eq("order_id", id)
        .maybeSingle<{ status: string | null }>();

      if (!alive) return;

      const nextStatus = resolveTrackingStatus(o?.status ?? null, j?.status ?? null);
      setOrder((prev) => (prev ? { ...prev, status: nextStatus } : prev));
    }

    const channel = supabase
      .channel(`order-tracking-vendor-${id}`)
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
  }, [id]);

  const gross = useMemo(() => (order ? computeGross(order) : 0), [order]);
  const fee = useMemo(() => computeVendorFee(gross), [gross]);
  const net = useMemo(() => computeVendorNet(gross), [gross]);

  async function updateStatus(nextStatus: string) {
    if (!order) return;

    setErr(null);
    setSaving(true);

    const { error } = await supabase.from("orders").update({ status: nextStatus }).eq("id", order.id);

    if (error) {
      setSaving(false);
      setErr(error.message);
      return;
    }

    setOrder({ ...order, status: nextStatus });
    setSaving(false);
  }

  async function acceptOrder() {
    if (!order) return;

    if (!canVendorAct(order.status)) {
      setErr("You can only accept or reject when status is pending_vendor");
      return;
    }

    setErr(null);
    setSaving(true);

    const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
    const session = sessionData.session;

    if (!session || sessionErr) {
      setSaving(false);
      setErr("Not signed in");
      return;
    }

    const token = session.access_token;

    const resp = await fetch("/api/vendor/orders/accept", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ orderId: order.id }),
    });

    let json: { ok?: boolean; error?: string; order?: { status?: string } } | null = null;

    try {
      json = await resp.json();
    } catch {
      setSaving(false);
      setErr("Accept failed: invalid JSON response from server");
      return;
    }

    if (!resp.ok || !json?.ok) {
      setSaving(false);
      setErr(json?.error ?? "Accept failed");
      return;
    }

    setOrder({ ...order, status: json?.order?.status ?? "accepted" });
    setSaving(false);
  }

  const renderItems = () => {
    if (!order) return null;

    if (order.order_type === "product") {
      if (productItems.length === 0) return <p className="text-sm text-gray-600">{itemsNote ?? "No items"}</p>;

      return (
        <div className="space-y-2">
          {productItems.map((it) => {
            const qty = safeNumber(it.qty, 1);
            const unit = safeNumber(it.unit_price ?? it.products?.price, 0);
            const total = safeNumber(it.line_total, lineTotal(qty, unit));
            const name = it.products?.name ?? "Product";

            return (
              <div key={it.id} className="rounded-xl border p-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold truncate">{name}</p>
                  <p className="text-xs text-gray-600 mt-1">
                    qty {qty} · unit {formatNaira(unit)}
                  </p>
                </div>
                <p className="font-semibold">{formatNaira(total)}</p>
              </div>
            );
          })}
        </div>
      );
    }

    const mode = order.food_mode ?? "plate";

    if (mode === "combo") {
      if (comboItems.length === 0) return <p className="text-sm text-gray-600">{itemsNote ?? "No items"}</p>;

      return (
        <div className="space-y-2">
          {comboItems.map((it) => {
            const qty = safeNumber(it.qty, 1);
            const unit = safeNumber(it.unit_price, 0);
            const total = safeNumber(it.line_total, lineTotal(qty, unit));
            const name = it.food_items?.name ?? "Combo";

            return (
              <div key={it.id} className="rounded-xl border p-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold truncate">{name}</p>
                  <p className="text-xs text-gray-600 mt-1">
                    qty {qty} · unit {formatNaira(unit)}
                  </p>
                </div>
                <p className="font-semibold">{formatNaira(total)}</p>
              </div>
            );
          })}
        </div>
      );
    }

    if (plateItems.length === 0) return <p className="text-sm text-gray-600">{itemsNote ?? "No items"}</p>;

    return (
      <div className="space-y-2">
        {plateItems.map((it) => {
          const qty = safeNumber(it.qty, 1);
          const unit = safeNumber(it.unit_price, 0);
          const total = safeNumber(it.line_total, lineTotal(qty, unit));
          const name = it.food_items?.name ?? "Food";
          const variant = it.food_item_variants?.name ?? "";

          return (
            <div key={it.id} className="rounded-xl border p-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold truncate">
                  {name}
                  {variant ? ` · ${variant}` : ""}
                </p>
                <p className="text-xs text-gray-600 mt-1">
                  qty {qty} · unit {formatNaira(unit)}
                </p>
              </div>
              <p className="font-semibold">{formatNaira(total)}</p>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border bg-white p-4 flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-600">Order details</p>
          <p className="text-base font-semibold">#{id?.slice(0, 8) ?? ""}</p>
        </div>

        <button type="button" className="rounded-xl border px-4 py-2 text-sm" onClick={() => router.back()}>
          Back
        </button>
      </div>

      {err ? <div className="rounded-2xl border bg-white p-4 text-sm text-red-600">{err}</div> : null}

      {loading ? (
        <div className="rounded-2xl border bg-white p-4 text-sm text-gray-600">Loading…</div>
      ) : !order ? (
        <div className="rounded-2xl border bg-white p-4 text-sm text-gray-600">No order</div>
      ) : (
        <>
          <div className="rounded-2xl border bg-white p-4 space-y-2">
            <div className="flex items-center justify-between gap-3">
              <p className="font-semibold">
                {order.order_type === "product"
                  ? "Products order"
                  : (order.food_mode ?? "plate") === "combo"
                  ? "Food combo order"
                  : "Food plate order"}
              </p>
              <p className="text-sm text-gray-600">{formatDateTime(order.created_at)}</p>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-xl border p-3">
                <p className="text-xs text-gray-600">Gross</p>
                <p className="text-base font-semibold">{formatNaira(gross)}</p>
              </div>

              <div className="rounded-xl border p-3">
                <p className="text-xs text-gray-600">Platform fee</p>
                <p className="text-base font-semibold">{formatNaira(fee)}</p>
              </div>

              <div className="rounded-xl border p-3">
                <p className="text-xs text-gray-600">Vendor net</p>
                <p className="text-base font-semibold">{formatNaira(net)}</p>
              </div>
            </div>

            <div className="rounded-xl border p-3">
              <p className="text-xs text-gray-600">Status</p>
              <p className="text-base font-semibold">{friendlyStatus(order.status)}</p>
              <p className="mt-1 text-xs text-gray-600">{settlementText(order.status)}</p>
            </div>

            {order.delivery_address ? (
              <div className="rounded-xl border p-3">
                <p className="text-xs text-gray-600">Delivery address</p>
                <p className="text-sm">{order.delivery_address}</p>
              </div>
            ) : null}

            {order.customer_phone ? (
              <div className="rounded-xl border p-3">
                <p className="text-xs text-gray-600">Customer phone</p>
                <p className="text-sm">{order.customer_phone}</p>
              </div>
            ) : null}

            {order.notes ? (
              <div className="rounded-xl border p-3">
                <p className="text-xs text-gray-600">Notes</p>
                <p className="text-sm whitespace-pre-wrap">{order.notes}</p>
              </div>
            ) : null}

            {order.paystack_reference ? (
              <div className="rounded-xl border p-3">
                <p className="text-xs text-gray-600">Paystack reference</p>
                <p className="text-sm break-all">{order.paystack_reference}</p>
              </div>
            ) : null}
          </div>

          <OrderTimeline status={order.status} />

          <div className="rounded-2xl border bg-white p-4">
            <p className="font-semibold">Items</p>
            <div className="mt-3">{renderItems()}</div>
          </div>

            {canVendorAct(order.status) ? (
              <div className="rounded-2xl border bg-white p-4">
                <p className="font-semibold">Vendor action</p>

                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    className="rounded-xl bg-black px-4 py-3 text-white disabled:opacity-50"
                    disabled={saving}
                    onClick={acceptOrder}
                  >
                    {saving ? "Saving..." : "Accept"}
                  </button>

                  <button
                    type="button"
                    className="rounded-xl border px-4 py-3 disabled:opacity-50"
                    disabled={saving}
                    onClick={() => updateStatus("rejected")}
                  >
                    Reject
                  </button>
                </div>

                <p className="mt-3 text-xs text-gray-600">
                  Accept will create a logistics job with vendor and customer snapshot, then set order status to accepted.
                </p>
              </div>
            ) : null}
        </>
      )}
    </div>
  );
}
