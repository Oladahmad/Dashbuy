"use client";

import { useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import { supabase } from "@/lib/supabaseClient";
import { useParams, useRouter } from "next/navigation";

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

export default function OrderDetailsPage() {
  const router = useRouter();
  const params = useParams();
  const id = String((params as { id?: string })?.id ?? "");

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  const [order, setOrder] = useState<OrderRow | null>(null);

  const [vendorName, setVendorName] = useState<string>("Vendor");

  const [productItems, setProductItems] = useState<ProductItemRow[]>([]);
  const [comboItems, setComboItems] = useState<ComboItemRow[]>([]);
  const [plateItems, setPlateItems] = useState<PlateItemRow[]>([]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setMsg("");

      setOrder(null);
      setVendorName("Vendor");
      setProductItems([]);
      setComboItems([]);
      setPlateItems([]);

      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData.session?.user;
      if (!user) {
        router.push("/auth/login");
        return;
      }

      const { data: o, error: oErr } = await supabase
        .from("orders")
        .select(
          "id,order_type,food_mode,status,delivery_address,subtotal,delivery_fee,total,created_at,paystack_reference,vendor_id,customer_id"
        )
        .eq("id", id)
        .eq("customer_id", user.id)
        .single();

      if (oErr) {
        setMsg(oErr.message);
        setLoading(false);
        return;
      }

      const ord = o as OrderRow;
      setOrder(ord);

      const { data: vp, error: vErr } = await supabase
        .from("profiles")
        .select("id,store_name,full_name")
        .eq("id", ord.vendor_id)
        .maybeSingle<VendorProfile>();

      if (!vErr && vp) {
        setVendorName(vp.store_name || vp.full_name || "Vendor");
      }

      if (ord.order_type === "product") {
        const { data: it, error: itErr } = await supabase
          .from("order_items")
          .select("id,qty,unit_price,line_total,products:product_id(id,name)")
          .eq("order_id", ord.id);

        if (itErr) {
          setMsg(itErr.message);
          setLoading(false);
          return;
        }

        setProductItems((it as unknown as ProductItemRow[]) ?? []);
        setLoading(false);
        return;
      }

      const mode = ord.food_mode ?? "plate";

      if (mode === "combo") {
        const { data: it, error: itErr } = await supabase
          .from("combo_order_items")
          .select("id,qty,unit_price,line_total,food_items:combo_food_id(id,name)")
          .eq("order_id", ord.id);

        if (itErr) {
          setMsg(itErr.message);
          setLoading(false);
          return;
        }

        setComboItems((it as unknown as ComboItemRow[]) ?? []);
        setLoading(false);
        return;
      }

      const { data: plates, error: pErr } = await supabase
        .from("order_plates")
        .select("id,order_id")
        .eq("order_id", ord.id);

      if (pErr) {
        setMsg(pErr.message);
        setLoading(false);
        return;
      }

      const plateRows = (plates as { id: string }[]) ?? [];
      const plateIds = plateRows.map((x) => x.id);

      if (plateIds.length === 0) {
        setPlateItems([]);
        setLoading(false);
        return;
      }

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

      setPlateItems((pit as unknown as PlateItemRow[]) ?? []);
      setLoading(false);
    })();
  }, [id, router]);

  const grouped = useMemo(() => {
    if (!order) return [];
    const vendor = vendorName || "Vendor";

    if (order.order_type === "product") return [[vendor, productItems]] as [string, ProductItemRow[]][];
    if ((order.food_mode ?? "plate") === "combo") return [[vendor, comboItems]] as [string, ComboItemRow[]][];
    return [[vendor, plateItems]] as [string, PlateItemRow[]][];
  }, [order, vendorName, productItems, comboItems, plateItems]);

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
              <p className="text-lg font-semibold">{labelForOrder(order)}</p>
              <span className="rounded-full border px-3 py-1 text-sm">{order.status ?? "unknown"}</span>
            </div>

            <p className="mt-2 text-sm text-gray-600">Date: {fmtDate(order.created_at)}</p>

            <p className="mt-2 text-sm text-gray-600">
              Address: <span className="text-gray-900">{order.delivery_address ?? "Not provided"}</span>
            </p>

            {order.paystack_reference ? <p className="mt-2 text-xs text-gray-500">Ref: {order.paystack_reference}</p> : null}
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
