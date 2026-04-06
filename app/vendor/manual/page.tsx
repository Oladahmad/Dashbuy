"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { parseManualLogisticsNotes } from "@/lib/manualLogistics";
import { extractOrderNameFromNotes } from "@/lib/orderName";

type ManualRow = {
  id: string;
  status: string | null;
  total: number | null;
  customer_phone: string | null;
  delivery_address: string | null;
  notes: string | null;
  created_at: string;
};

function naira(n: number) {
  return `N${Math.round(Number(n) || 0).toLocaleString()}`;
}

function friendlyStatus(status: string | null) {
  const value = String(status ?? "").replace(/_/g, " ").trim();
  return value || "pending vendor";
}

export default function VendorManualPage() {
  const router = useRouter();
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [itemsText, setItemsText] = useState("");
  const [riderMapUrl, setRiderMapUrl] = useState("");
  const [total, setTotal] = useState("");
  const [msg, setMsg] = useState("");
  const [msgType, setMsgType] = useState<"error" | "success">("error");
  const [creating, setCreating] = useState(false);
  const [recent, setRecent] = useState<ManualRow[]>([]);
  const [loadingRecent, setLoadingRecent] = useState(true);

  async function loadRecent() {
    setLoadingRecent(true);
    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData.session?.user;
    if (!user) {
      router.push("/auth/login");
      return;
    }

    const { data, error } = await supabase
      .from("orders")
      .select("id,status,total,customer_phone,delivery_address,notes,created_at")
      .eq("vendor_id", user.id)
      .ilike("notes", "%[LOGI_DIRECT=1]%")
      .order("created_at", { ascending: false });

    if (error) {
      setMsg(error.message);
      setMsgType("error");
      setRecent([]);
      setLoadingRecent(false);
      return;
    }

    const rows = ((data ?? []) as ManualRow[]).filter((row) => parseManualLogisticsNotes(row.notes).source === "vendor");
    setRecent(rows);
    setLoadingRecent(false);
  }

  useEffect(() => {
    loadRecent();
  }, []);

  async function createManualOrder() {
    setMsg("");
    setMsgType("error");

    if (!customerName.trim()) return setMsg("Customer name is required.");
    if (!customerPhone.trim()) return setMsg("Customer phone is required.");
    if (!deliveryAddress.trim()) return setMsg("Delivery address is required.");
    if (!itemsText.trim()) return setMsg("Ordered items are required.");
    if (!Number.isFinite(Number(total)) || Number(total) <= 0) return setMsg("Enter a valid total amount.");

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      router.push("/auth/login");
      return;
    }

    setCreating(true);
    const res = await fetch("/api/vendor/manual-orders/create", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        customerName,
        customerPhone,
        deliveryAddress,
        itemsText,
        riderMapUrl,
        total: Number(total),
      }),
    });

    const body = (await res.json().catch(() => null)) as { ok?: boolean; error?: string; orderId?: string } | null;
    if (!res.ok || !body?.ok) {
      setCreating(false);
      setMsgType("error");
      setMsg(body?.error ?? "Failed to create order.");
      return;
    }

    setGeneratedLink(body.link ?? "");
    setCustomerName("");
    setCustomerPhone("");
    setDeliveryAddress("");
    setItemsText("");
    setRiderMapUrl("");
    setTotal("");
    setCreating(false);
    router.push(`/vendor/manual/${body.orderId}`);
  }

  return (
    <main className="space-y-4">
      <div className="rounded-2xl border bg-white p-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h1 className="text-lg font-semibold">Manual customer orders</h1>
            <p className="mt-1 text-sm text-gray-600">Create paid orders and manage each order from its own details page.</p>
          </div>
          <button type="button" className="rounded-xl border px-3 py-2 text-sm" onClick={() => router.push("/vendor")}>
            Back
          </button>
        </div>
      </div>

      <div className="rounded-2xl border bg-white p-4">
        <p className="font-semibold">Create order</p>
        <div className="mt-3 grid gap-3">
          <div>
            <label className="text-sm">Customer name</label>
            <input className="mt-1 w-full rounded-xl border px-3 py-2" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
          </div>
          <div>
            <label className="text-sm">Customer phone</label>
            <input className="mt-1 w-full rounded-xl border px-3 py-2" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} />
          </div>
          <div>
            <label className="text-sm">Delivery address</label>
            <textarea className="mt-1 w-full rounded-xl border px-3 py-2" rows={3} value={deliveryAddress} onChange={(e) => setDeliveryAddress(e.target.value)} />
          </div>
          <div>
            <label className="text-sm">Items ordered</label>
            <textarea
              className="mt-1 w-full rounded-xl border px-3 py-2"
              rows={4}
              placeholder={"Rice x2 - N4,000\nChicken x1 - N2,000"}
              value={itemsText}
              onChange={(e) => setItemsText(e.target.value)}
            />
          </div>
          <div>
            <label className="text-sm">Rider live map link (optional)</label>
            <input
              className="mt-1 w-full rounded-xl border px-3 py-2"
              placeholder="https://maps.google.com/..."
              value={riderMapUrl}
              onChange={(e) => setRiderMapUrl(e.target.value)}
            />
          </div>
          <div>
            <label className="text-sm">Total paid amount</label>
            <input className="mt-1 w-full rounded-xl border px-3 py-2" type="number" inputMode="numeric" value={total} onChange={(e) => setTotal(e.target.value)} />
          </div>
        </div>

          <button type="button" className="mt-4 w-full rounded-xl bg-black px-4 py-3 text-white disabled:opacity-60" onClick={createManualOrder} disabled={creating}>
          {creating ? "Creating..." : "Create paid order"}
          </button>
      </div>

      <div className="rounded-2xl border bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="font-semibold">Recent manual orders</p>
          <button
            type="button"
            className="rounded-xl border px-3 py-2 text-sm"
            onClick={() => router.push("/vendor/manual/orders")}
          >
            View all
          </button>
        </div>
        {loadingRecent ? (
          <p className="mt-2 text-sm text-gray-600">Loading...</p>
        ) : recent.length === 0 ? (
          <p className="mt-2 text-sm text-gray-600">No manual orders yet.</p>
        ) : (
          <div className="mt-3 grid gap-2">
            {recent.slice(0, 3).map((row) => {
              const manual = parseManualLogisticsNotes(row.notes);
              const orderName = extractOrderNameFromNotes(row.notes) || "Manual order";
              return (
                <div
                  key={`recent-${row.id}`}
                  role="button"
                  tabIndex={0}
                  className="rounded-xl border p-3 text-left hover:bg-gray-50"
                  onClick={() => router.push(`/vendor/manual/${row.id}`)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      router.push(`/vendor/manual/${row.id}`);
                    }
                  }}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{orderName}</p>
                      <p className="mt-1 text-xs text-gray-600">
                        {manual.customerName || "Customer"} · {friendlyStatus(row.status)}
                      </p>
                    </div>
                    <p className="font-semibold">{naira(Number(row.total ?? 0))}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {msg ? (
        <div className={`rounded-2xl border bg-white p-4 text-sm ${msgType === "success" ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "text-red-600"}`}>
          {msg}
        </div>
      ) : null}
    </main>
  );
}
