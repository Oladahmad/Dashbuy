"use client";

import { useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";
import { extractOrderNameFromNotes } from "@/lib/orderName";
import { parseErrandQuote } from "@/lib/errandQuote";

type OrderRow = {
  id: string;
  order_type: "food" | "product";
  food_mode: "plate" | "combo" | null;
  status: string | null;
  total: number | null;
  created_at: string;
  paystack_reference: string | null;
  notes: string | null;
};

type OrderGroup = {
  id: string;
  order_type: "food" | "product" | "mixed";
  food_mode: "plate" | "combo" | null;
  status: string | null;
  total: number;
  created_at: string;
  paystack_reference: string | null;
  orders: OrderRow[];
  orderName: string;
  errandQuoteState: "none" | "pending" | "quoted" | "approved";
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

function labelForOrder(o: Pick<OrderGroup, "order_type" | "food_mode">) {
  if (o.order_type === "mixed") return "Combined Order";
  if (o.order_type === "product") return "Product Order";
  if ((o.food_mode ?? "plate") === "combo") return "Food Combo Order";
  return "Food Plate Order";
}

function groupOrderName(group: OrderRow[]) {
  for (const row of group) {
    const fromNotes = extractOrderNameFromNotes(row.notes);
    if (fromNotes) return fromNotes;
  }
  return "";
}

function typeForOrder(o: Pick<OrderGroup, "order_type" | "food_mode">) {
  if (o.order_type === "mixed") return "Type: Mixed purchase";
  if (o.order_type === "product") return "Type: Products";
  if ((o.food_mode ?? "plate") === "combo") return "Type: Food - Combo";
  return "Type: Food - Plate";
}

function friendlyStatus(status: string | null) {
  const s = (status ?? "").toLowerCase();
  if (s === "pending_payment") return "Awaiting payment";
  if (s === "pending_vendor") return "Paid - waiting vendor";
  if (s === "accepted") return "Accepted";
  if (s === "rejected" || s === "declined") return "Declined";
  if (s === "picked_up") return "On delivery";
  if (s === "pending_pickup") return "Rider pending pickup";
  if (s === "delivered") return "Delivered";
  if (s === "cancelled") return "Cancelled";
  if (s === "refunded") return "Refunded";
  return status ?? "Unknown";
}

function groupKey(order: OrderRow) {
  return order.paystack_reference?.trim() || order.id;
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

function groupType(orders: OrderRow[]): Pick<OrderGroup, "order_type" | "food_mode"> {
  const types = Array.from(new Set(orders.map((o) => o.order_type)));
  if (types.length > 1) return { order_type: "mixed", food_mode: null };
  const onlyType = types[0] ?? "product";
  if (onlyType === "product") return { order_type: "product", food_mode: null };
  const foodModes = Array.from(new Set(orders.map((o) => o.food_mode).filter(Boolean)));
  return {
    order_type: "food",
    food_mode: foodModes.length === 1 ? (foodModes[0] as "plate" | "combo") : null,
  };
}

export default function OrdersPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [payingId, setPayingId] = useState<string | null>(null);

  const groupedOrders = useMemo(() => {
    const groups = new Map<string, OrderRow[]>();
    for (const order of orders) {
      const key = groupKey(order);
      const existing = groups.get(key) ?? [];
      existing.push(order);
      groups.set(key, existing);
    }

    return Array.from(groups.values())
      .map((group): OrderGroup => {
        const sorted = [...group].sort((a, b) => b.created_at.localeCompare(a.created_at));
        const primary = sorted[0];
        const typeInfo = groupType(sorted);
        const errandStates = sorted
          .map((row) => parseErrandQuote(row.notes))
          .filter((meta) => meta.isErrand)
          .map((meta) => meta.status ?? "pending");
        let errandQuoteState: OrderGroup["errandQuoteState"] = "none";
        if (errandStates.length > 0) {
          if (errandStates.includes("pending")) errandQuoteState = "pending";
          else if (errandStates.includes("quoted")) errandQuoteState = "quoted";
          else errandQuoteState = "approved";
        }

        return {
          id: primary.id,
          order_type: typeInfo.order_type,
          food_mode: typeInfo.food_mode,
          status: groupStatus(sorted),
          total: sorted.reduce((sum, item) => sum + Number(item.total ?? 0), 0),
          created_at: primary.created_at,
          paystack_reference: primary.paystack_reference,
          orders: sorted,
          orderName: groupOrderName(sorted),
          errandQuoteState,
        };
      })
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }, [orders]);

  async function approveQuoteAndPay(group: OrderGroup) {
    setApprovingId(group.id);
    setMsg("");

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setApprovingId(null);
      router.push("/auth/login?next=%2Forders");
      return;
    }

    const res = await fetch("/api/orders/approve-quote", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        orderIds: group.orders.map((row) => row.id),
      }),
    });
    const body = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
    if (!res.ok || !body?.ok) {
      setApprovingId(null);
      setMsg(body?.error ?? "Failed to approve quote.");
      return;
    }

    setApprovingId(null);
    await continuePayment(group);
  }

  async function continuePayment(group: OrderGroup) {
    setPayingId(group.id);
    setMsg("");

    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData.session;
    const token = session?.access_token;
    const email = session?.user?.email?.trim() ?? "";
    if (!token || !email) {
      setPayingId(null);
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
        orderId: group.orders.length === 1 ? group.id : undefined,
        orderIds: group.orders.map((row) => row.id),
        email,
      }),
    });
    const body = (await res.json().catch(() => null)) as { ok?: boolean; error?: string; authorization_url?: string } | null;
    if (!res.ok || !body?.ok || !body.authorization_url) {
      setPayingId(null);
      setMsg(body?.error ?? "Unable to continue payment.");
      return;
    }

    window.location.href = body.authorization_url;
  }

  const counts = useMemo(() => {
    let food = 0;
    let products = 0;
    for (const o of groupedOrders) {
      if (o.order_type === "food") food += 1;
      if (o.order_type === "product") products += 1;
      if (o.order_type === "mixed") {
        food += 1;
        products += 1;
      }
    }
    return { food, products, total: groupedOrders.length };
  }, [groupedOrders]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setMsg("");
      setOrders([]);

      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData.session?.user;
      if (!user) {
        router.push("/auth/login");
        return;
      }

      const { data, error } = await supabase
        .from("orders")
        .select("id,order_type,food_mode,status,total,created_at,paystack_reference,notes")
        .eq("customer_id", user.id)
        .order("created_at", { ascending: false });

      if (error) {
        setMsg(error.message);
        setOrders([]);
        setLoading(false);
        return;
      }

      const rows = (data as OrderRow[]) ?? [];
      const orderIds = rows.map((o) => o.id);
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

        for (const row of rows) {
          if (deliveredOrderIds.has(row.id)) row.status = "delivered";
        }
      }

      setOrders(rows);
      setLoading(false);
    })();
  }, [router]);

  return (
    <AppShell title="Orders">
      <button
        className="rounded-xl border px-4 py-2 bg-white"
        onClick={() => router.push("/account")}
        type="button"
      >
        ← Back to account
      </button>

      {msg ? (
        <div className="mt-4 rounded-2xl border bg-white p-4 text-sm text-red-600">{msg}</div>
      ) : null}

      <div className="mt-4 rounded-2xl border bg-white p-5">
        <p className="text-lg font-semibold">Your orders</p>
        <p className="mt-1 text-sm text-gray-600">
          Total {counts.total} · Food {counts.food} · Products {counts.products}
        </p>
      </div>

      {loading ? (
        <div className="mt-4 rounded-2xl border bg-white p-5 text-sm text-gray-600">Loading orders...</div>
      ) : groupedOrders.length === 0 ? (
        <div className="mt-4 rounded-2xl border bg-white p-5 text-sm text-gray-600">No orders yet.</div>
      ) : (
        <div className="mt-4 grid gap-3">
          {groupedOrders.map((o) => {
            const isPendingPayment = (o.status ?? "").toLowerCase() === "pending_payment";
            return (
              <div key={o.id} className="rounded-2xl border bg-white p-4">
                <button
                  type="button"
                  onClick={() => router.push(`/orders/${o.id}`)}
                  className="w-full text-left"
                >
                  <div className="flex items-center justify-between">
                    <p className="font-semibold">{labelForOrder(o)}</p>
                    {o.orderName ? <p className="mt-1 text-xs text-gray-500">{o.orderName}</p> : null}
                    <p className="font-bold">{naira(o.total ?? 0)}</p>
                  </div>

                  <div className="mt-1 flex items-center justify-between text-sm text-gray-600">
                    <span>
                      {o.errandQuoteState === "pending" && isPendingPayment
                        ? "Awaiting final quote"
                        : o.errandQuoteState === "quoted" && isPendingPayment
                          ? "Quote ready for approval"
                          : friendlyStatus(o.status)}
                    </span>
                    <span>{fmtDate(o.created_at)}</span>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">{typeForOrder(o)}</p>
                  {o.orders.length > 1 ? (
                    <p className="mt-1 text-xs text-gray-500">{o.orders.length} vendor orders in this purchase</p>
                  ) : null}
                </button>

                {isPendingPayment && o.errandQuoteState === "quoted" ? (
                  <button
                    type="button"
                    className="mt-3 rounded-xl bg-black px-4 py-2 text-sm text-white disabled:opacity-60"
                    onClick={() => approveQuoteAndPay(o)}
                    disabled={approvingId === o.id}
                  >
                    {approvingId === o.id ? "Approving..." : "Approve quote & continue payment"}
                  </button>
                ) : null}

                {isPendingPayment && o.errandQuoteState === "pending" ? (
                  <p className="mt-3 text-sm text-gray-600">
                    Admin is preparing your final quote. Payment will open once quote is sent.
                  </p>
                ) : null}

                {isPendingPayment && (o.errandQuoteState === "none" || o.errandQuoteState === "approved") ? (
                  <button
                    type="button"
                    className="mt-3 rounded-xl bg-black px-4 py-2 text-sm text-white"
                    onClick={() => void continuePayment(o)}
                    disabled={payingId === o.id}
                  >
                    {payingId === o.id ? "Opening payment..." : "Continue payment"}
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      <div className="h-3" />
    </AppShell>
  );
}
