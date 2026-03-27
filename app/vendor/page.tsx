"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { extractOrderNameFromNotes } from "@/lib/orderName";

type Role = "customer" | "vendor_food" | "vendor_products" | "admin";

type Profile = {
  id: string;
  role: Role;
};

type OrderDetailsMeta = {
  summary: string;
  buyerName: string;
};

type UnknownRow = Record<string, unknown>;

function pickNumber(row: UnknownRow, keys: string[]) {
  for (const k of keys) {
    const v = row[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string") {
      const n = Number(v);
      if (Number.isFinite(n)) return n;
    }
  }
  return 0;
}

function pickString(row: UnknownRow, keys: string[]) {
  for (const k of keys) {
    const v = row[k];
    if (typeof v === "string" && v.trim()) return v;
  }
  return "";
}

function formatNaira(n: number) {
  const value = Math.max(0, Math.floor(n));
  return "N" + value.toLocaleString();
}

function getStoragePublicUrl(bucket: "product-images" | "food-images", pathOrUrl: string) {
  const raw = pathOrUrl.trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  const { data } = supabase.storage.from(bucket).getPublicUrl(raw);
  return data.publicUrl || "";
}

function uploadImageUrl(row: UnknownRow, isFoodVendor: boolean) {
  if (isFoodVendor) {
    const img = pickString(row, ["image_url", "image", "photo"]);
    if (!img) return "";
    return getStoragePublicUrl("food-images", img);
  }

  const path = pickString(row, ["image_path", "image_url", "image"]);
  if (!path) return "";
  return getStoragePublicUrl("product-images", path);
}

function uploadCategory(row: UnknownRow) {
  return pickString(row, ["category", "food_type"]) || "Uncategorized";
}

function uploadPrice(row: UnknownRow, isFoodVendor: boolean) {
  if (isFoodVendor) {
    const pricingType = pickString(row, ["pricing_type"]).toLowerCase();
    if (pricingType === "per_unit") return pickNumber(row, ["unit_price", "price"]);
    return pickNumber(row, ["price", "unit_price"]);
  }
  return pickNumber(row, ["price"]);
}

function orderCommissionBase(row: UnknownRow) {
  const subtotal = pickNumber(row, ["subtotal"]);
  if (subtotal > 0) return subtotal;

  const total = pickNumber(row, ["total_amount", "total", "amount", "grand_total"]);
  const delivery = pickNumber(row, ["delivery_fee"]);
  if (total > 0) return Math.max(0, total - delivery);

  return 0;
}

function isDeliveredStatus(status: string) {
  return status.toLowerCase() === "delivered";
}

function isPaidStatus(status: string) {
  const s = status.toLowerCase();
  return !["pending_payment", "rejected", "declined", "cancelled", "refunded"].includes(s);
}

function isPendingPaymentStatus(status: string) {
  return status.toLowerCase() === "pending_payment";
}

function uniqueNames(names: string[]) {
  return Array.from(new Set(names.map((x) => x.trim()).filter(Boolean)));
}

function summarizeItems(names: string[]) {
  const unique = uniqueNames(names);
  if (unique.length === 0) return "Order items";
  if (unique.length <= 3) return unique.join(", ");
  return `${unique.slice(0, 3).join(", ")} +${unique.length - 3} more`;
}

export default function VendorDashboardPage() {
  const [role, setRole] = useState<Role>("vendor_food");

  const [orders, setOrders] = useState<UnknownRow[]>([]);
  const [uploads, setUploads] = useState<UnknownRow[]>([]);
  const [orderMeta, setOrderMeta] = useState<Record<string, OrderDetailsMeta>>({});
  const [loading, setLoading] = useState(true);

  const isFoodVendor = role === "vendor_food" || role === "admin";

  const uploadLabel = isFoodVendor ? "food" : "product";
  const addHref = isFoodVendor ? "/vendor/food/new" : "/vendor/products/new";
  const uploadsHref = isFoodVendor ? "/vendor/food" : "/vendor/products";

  useEffect(() => {
    let alive = true;

    async function load() {
      setLoading(true);

      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData.session?.user;
      const accessToken = sessionData.session?.access_token ?? "";

      if (!user) {
        if (alive) setLoading(false);
        return;
      }

      const { data: p } = await supabase
        .from("profiles")
        .select("id, role")
        .eq("id", user.id)
        .maybeSingle<Profile>();

      const r = (p?.role ?? "customer") as Role;
      if (!alive) return;

      setRole(r);

      const vendorId = user.id;

      const { data: o } = await supabase
        .from("orders")
        .select("*")
        .eq("vendor_id", vendorId)
        .order("created_at", { ascending: false })
        .limit(20);

      const ordersRows = (o ?? []) as UnknownRow[];
      const orderIds = ordersRows
        .map((row) => pickString(row, ["id"]))
        .filter((x) => x.length > 0);

      if (orderIds.length > 0) {
        const { data: jobs } = await supabase
          .from("logistics_jobs")
          .select("order_id,status")
          .in("order_id", orderIds);

        const deliveredOrderIds = new Set(
          ((jobs ?? []) as Array<{ order_id: string; status: string | null }>)
            .filter((j) => (j.status ?? "").toLowerCase() === "delivered")
            .map((j) => j.order_id)
        );

        for (const row of ordersRows) {
          const id = pickString(row, ["id"]);
          if (id && deliveredOrderIds.has(id)) {
            row.status = "delivered";
          }
        }
      }

      if (!alive) return;
      setOrders(ordersRows);

      const metaMap: Record<string, OrderDetailsMeta> = {};
      const orderItemNames = new Map<string, string[]>();
      const buyerNamesByOrderId = new Map<string, string>();

      if (orderIds.length > 0) {
        if (accessToken) {
          try {
            const buyersRes = await fetch("/api/vendor/recent-order-buyers", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${accessToken}`,
              },
              body: JSON.stringify({ orderIds }),
            });
            const buyersBody = (await buyersRes.json()) as {
              ok?: boolean;
              buyersByOrderId?: Record<string, string>;
            };
            if (buyersRes.ok && buyersBody.ok && buyersBody.buyersByOrderId) {
              for (const [k, v] of Object.entries(buyersBody.buyersByOrderId)) {
                const name = String(v ?? "").trim();
                if (name) buyerNamesByOrderId.set(k, name);
              }
            }
          } catch {
            // keep UI working even if buyers API is temporarily unavailable
          }
        }

        const { data: productItems } = await supabase
          .from("order_items")
          .select("order_id,products:product_id(name)")
          .in("order_id", orderIds);
        for (const row of (productItems as Array<Record<string, unknown>> | null) ?? []) {
          const orderId = pickString(row, ["order_id"]);
          const product = (row.products as { name?: string } | null) ?? null;
          const name = (product?.name ?? "").trim();
          if (!orderId || !name) continue;
          orderItemNames.set(orderId, [...(orderItemNames.get(orderId) ?? []), name]);
        }

        const { data: comboItems } = await supabase
          .from("combo_order_items")
          .select("order_id,food_items:combo_food_id(name)")
          .in("order_id", orderIds);
        for (const row of (comboItems as Array<Record<string, unknown>> | null) ?? []) {
          const orderId = pickString(row, ["order_id"]);
          const food = (row.food_items as { name?: string } | null) ?? null;
          const name = (food?.name ?? "").trim();
          if (!orderId || !name) continue;
          orderItemNames.set(orderId, [...(orderItemNames.get(orderId) ?? []), name]);
        }

        const { data: plates } = await supabase.from("order_plates").select("id,order_id").in("order_id", orderIds);
        const plateRows = (plates as Array<{ id: string; order_id: string }> | null) ?? [];
        const plateIds = plateRows.map((p) => p.id).filter(Boolean);
        const orderIdByPlateId = new Map(plateRows.map((p) => [p.id, p.order_id]));

        if (plateIds.length > 0) {
          const { data: plateItems } = await supabase
            .from("order_plate_items")
            .select("order_plate_id,food_items:food_item_id(name),food_item_variants:variant_id(name)")
            .in("order_plate_id", plateIds);
          for (const row of (plateItems as Array<Record<string, unknown>> | null) ?? []) {
            const plateId = pickString(row, ["order_plate_id"]);
            const orderId = orderIdByPlateId.get(plateId) ?? "";
            const food = (row.food_items as { name?: string } | null) ?? null;
            const variant = (row.food_item_variants as { name?: string } | null) ?? null;
            const base = (food?.name ?? "").trim();
            const variantName = (variant?.name ?? "").trim();
            const name = variantName ? `${base} ${variantName}` : base;
            if (!orderId || !name) continue;
            orderItemNames.set(orderId, [...(orderItemNames.get(orderId) ?? []), name]);
          }
        }
      }

      for (const row of ordersRows) {
        const orderId = pickString(row, ["id"]);
        if (!orderId) continue;
        const itemSummary = summarizeItems(orderItemNames.get(orderId) ?? []);
        const buyer = buyerNamesByOrderId.get(orderId) || "Buyer";
        metaMap[orderId] = { summary: itemSummary, buyerName: buyer };
      }

      if (!alive) return;
      setOrderMeta(metaMap);

      if (r === "vendor_products") {
        const { data: pr } = await supabase
          .from("products")
          .select("*")
          .eq("vendor_id", vendorId)
          .order("created_at", { ascending: false })
          .limit(10);

        if (!alive) return;
        setUploads((pr ?? []) as UnknownRow[]);
      } else {
        const { data: fi } = await supabase
          .from("food_items")
          .select("*")
          .eq("vendor_id", vendorId)
          .order("created_at", { ascending: false })
          .limit(10);

        if (!alive) return;
        setUploads((fi ?? []) as UnknownRow[]);
      }

      if (alive) setLoading(false);
    }

    load();

    return () => {
      alive = false;
    };
  }, []);

  const summary = useMemo(() => {
    const rows = orders.map((row) => {
      const status = pickString(row, ["status"]) || "pending_payment";
      const base = orderCommissionBase(row);
      const net = Math.max(0, Math.round(base - base * 0.05));
      return { status, net };
    });

    const settled = rows.filter((r) => isDeliveredStatus(r.status)).reduce((s, r) => s + r.net, 0);
    const pendingConfirmation = rows
      .filter((r) => isPaidStatus(r.status) && !isDeliveredStatus(r.status))
      .reduce((s, r) => s + r.net, 0);

    return {
      ordersCount: rows.filter((r) => !isPendingPaymentStatus(r.status)).length,
      pendingConfirmation,
      settled,
    };
  }, [orders]);

  const recentUploads = uploads.slice(0, 3);
  const recentOrders = orders.slice(0, 3);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border bg-white p-4">
        <p className="text-sm text-gray-600">Summary</p>

        <div className="mt-3 grid grid-cols-3 gap-2">
          <div className="rounded-xl border p-3">
            <p className="text-xs text-gray-600">Orders</p>
            <p className="mt-1 text-lg font-semibold">{loading ? "..." : summary.ordersCount}</p>
          </div>

          <div className="rounded-xl border p-3">
            <p className="text-xs text-gray-600">Pending confirmation</p>
            <p className="mt-1 text-lg font-semibold">
              {loading ? "..." : formatNaira(summary.pendingConfirmation)}
            </p>
          </div>

          <div className="rounded-xl border p-3">
            <p className="text-xs text-gray-600">Vendor revenue settled</p>
            <p className="mt-1 text-lg font-semibold">{loading ? "..." : formatNaira(summary.settled)}</p>
          </div>
        </div>
        <p className="mt-2 text-xs text-gray-600">
          Pending confirmation helps prevent scams until logistics confirms delivery.
        </p>
      </div>

      <div className="rounded-2xl border bg-white p-4">
        <div className="flex items-center justify-between">
          <p className="font-semibold">Recent uploads</p>
          <Link href={uploadsHref} className="text-sm underline">
            View all
          </Link>
        </div>

        <div className="mt-3 space-y-2">
          {loading ? (
            <p className="text-sm text-gray-600">Loading...</p>
          ) : recentUploads.length === 0 ? (
            <p className="text-sm text-gray-600">No upload yet</p>
          ) : (
            recentUploads.map((row, idx) => {
              const name = pickString(row, ["name", "title"]) || `${uploadLabel} ${idx + 1}`;
              const image = uploadImageUrl(row, isFoodVendor);
              const category = uploadCategory(row);
              const price = uploadPrice(row, isFoodVendor);
              return (
                <div key={idx} className="rounded-xl border p-3">
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 overflow-hidden rounded-lg border bg-gray-100">
                      {image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={image} alt={name} className="h-full w-full object-cover" />
                      ) : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{name}</p>
                      <p className="text-xs text-gray-600">Category: {category}</p>
                      <p className="text-xs text-gray-600">Price: {formatNaira(price)}</p>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="mt-4 grid gap-2">
          <Link href={addHref} className="w-full rounded-xl bg-black px-4 py-3 text-center text-white">
            {isFoodVendor ? "Add new food" : "Add new product"}
          </Link>
        </div>
      </div>

      {role === "admin" ? (
        <div className="rounded-2xl border bg-white p-4">
          <p className="font-semibold">Admin tools</p>
          <p className="mt-1 text-sm text-gray-600">Inspect custom restaurant request orders submitted from Food.</p>
          <Link href="/admin/custom-food-requests" className="mt-3 block w-full rounded-xl border px-4 py-3 text-center">
            View custom food requests
          </Link>
        </div>
      ) : null}

      <div className="rounded-2xl border bg-white p-4">
        <div className="flex items-center justify-between">
          <p className="font-semibold">Recent orders</p>
        </div>

        <div className="mt-3 space-y-2">
          {loading ? (
            <p className="text-sm text-gray-600">Loading...</p>
          ) : recentOrders.length === 0 ? (
            <p className="text-sm text-gray-600">No orders yet</p>
          ) : (
            recentOrders.map((row, idx) => {
              const id = pickString(row, ["id", "order_id"]) || `order ${idx + 1}`;
              const status = pickString(row, ["status"]) || "pending";
              const amount = orderCommissionBase(row);
              const fallbackName = extractOrderNameFromNotes(pickString(row, ["notes"])) || "Order items";
              const meta = orderMeta[id];
              const title = meta?.summary || fallbackName;
              const buyer = meta?.buyerName || "Customer";
              return (
                <Link key={idx} href={`/vendor/orders/${id}`} className="block rounded-xl border p-3 hover:bg-gray-50">
                  <div className="flex items-center justify-between">
                    <p className="font-medium truncate">{title}</p>
                    <p className="text-sm">{formatNaira(amount)}</p>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">Buyer: {buyer}</p>
                  <p className="mt-1 text-xs text-gray-500">Status: {status}</p>
                </Link>
              );
            })
          )}
        </div>

        <div className="mt-4">
          <Link href="/vendor/orders" className="w-full rounded-xl border px-4 py-3 text-center block">
            View orders
          </Link>
        </div>
      </div>
    </div>
  );
}
