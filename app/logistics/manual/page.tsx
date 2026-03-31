"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { parseManualLogisticsNotes } from "@/lib/manualLogistics";
import { extractOrderNameFromNotes } from "@/lib/orderName";
import { useRouter } from "next/navigation";

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

export default function LogisticsManualPage() {
  const router = useRouter();
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [itemsText, setItemsText] = useState("");
  const [total, setTotal] = useState("");
  const [msg, setMsg] = useState("");
  const [creating, setCreating] = useState(false);
  const [generatedLink, setGeneratedLink] = useState("");
  const [recent, setRecent] = useState<ManualRow[]>([]);
  const [loadingRecent, setLoadingRecent] = useState(true);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);

  async function loadRecent() {
    setLoadingRecent(true);
    const { data, error } = await supabase
      .from("orders")
      .select("id,status,total,customer_phone,delivery_address,notes,created_at")
      .ilike("notes", "%[LOGI_DIRECT=1]%")
      .order("created_at", { ascending: false });

    if (error) {
      setMsg(error.message);
      setRecent([]);
      setLoadingRecent(false);
      return;
    }

    setRecent(((data ?? []) as ManualRow[]) || []);
    setLoadingRecent(false);
  }

  useEffect(() => {
    loadRecent();
  }, []);

  async function createManualOrder() {
    setMsg("");
    setGeneratedLink("");

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
    const res = await fetch("/api/logistics/manual-orders/create", {
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
        total: Number(total),
      }),
    });

    const body = (await res.json().catch(() => null)) as
      | { ok?: boolean; error?: string; link?: string }
      | null;

    if (!res.ok || !body?.ok) {
      setCreating(false);
      setMsg(body?.error ?? "Failed to create order.");
      return;
    }

    setGeneratedLink(body.link ?? "");
    setCustomerName("");
    setCustomerPhone("");
    setDeliveryAddress("");
    setItemsText("");
    setTotal("");
    setCreating(false);
    await loadRecent();
  }

  async function acceptOrder(orderId: string) {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      router.push("/auth/login");
      return;
    }

    setAcceptingId(orderId);
    setMsg("");
    const res = await fetch("/api/logistics/manual-orders/accept", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ orderId }),
    });
    const body = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
    if (!res.ok || !body?.ok) {
      setAcceptingId(null);
      setMsg(body?.error ?? "Failed to accept order.");
      return;
    }

    setAcceptingId(null);
    await loadRecent();
  }

  async function copyGeneratedLink() {
    if (!generatedLink) return;
    try {
      await navigator.clipboard.writeText(generatedLink);
      setMsg("Tracking link copied.");
    } catch {
      setMsg("Could not copy link on this device.");
    }
  }

  function sendGeneratedLinkWhatsApp() {
    if (!generatedLink) return;
    const text = encodeURIComponent(`Hello,\nTrack your Dashbuy delivery with this link:\n${generatedLink}`);
    window.open(`https://wa.me/?text=${text}`, "_blank");
  }

  return (
    <main className="space-y-4">
      <div className="rounded-2xl border bg-white p-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h1 className="text-lg font-semibold">Manual customer orders</h1>
            <p className="mt-1 text-sm text-gray-600">Create paid orders and generate tracking links for your direct customers.</p>
          </div>
          <button type="button" className="rounded-xl border px-3 py-2 text-sm" onClick={() => router.push("/logistics")}>
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
            <textarea className="mt-1 w-full rounded-xl border px-3 py-2" rows={4} placeholder={"Rice x2 - N4,000\nChicken x1 - N2,000"} value={itemsText} onChange={(e) => setItemsText(e.target.value)} />
          </div>
          <div>
            <label className="text-sm">Total paid amount</label>
            <input className="mt-1 w-full rounded-xl border px-3 py-2" type="number" inputMode="numeric" value={total} onChange={(e) => setTotal(e.target.value)} />
          </div>
        </div>

        <button type="button" className="mt-4 w-full rounded-xl bg-black px-4 py-3 text-white disabled:opacity-60" onClick={createManualOrder} disabled={creating}>
          {creating ? "Creating..." : "Create paid order & generate link"}
        </button>

        {generatedLink ? (
          <div className="mt-3 rounded-xl border bg-gray-50 p-3">
            <p className="text-xs text-gray-600">Tracking link</p>
            <p className="mt-1 break-all text-sm">{generatedLink}</p>
            <div className="mt-3 flex gap-2">
              <button type="button" className="rounded-lg border bg-white px-3 py-2 text-xs" onClick={copyGeneratedLink}>
                Copy link
              </button>
              <button type="button" className="rounded-lg border bg-white px-3 py-2 text-xs" onClick={sendGeneratedLinkWhatsApp}>
                Send via WhatsApp
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <div className="rounded-2xl border bg-white p-4">
        <p className="font-semibold">Recent manual orders</p>
        {loadingRecent ? (
          <p className="mt-2 text-sm text-gray-600">Loading...</p>
        ) : recent.length === 0 ? (
          <p className="mt-2 text-sm text-gray-600">No manual orders yet.</p>
        ) : (
          <div className="mt-3 grid gap-2">
            {recent.slice(0, 20).map((row) => {
              const manual = parseManualLogisticsNotes(row.notes);
              const orderName = extractOrderNameFromNotes(row.notes) || "Delivery order";
              const isPending = String(row.status ?? "") === "pending_vendor";
              return (
                <button
                  key={`recent-${row.id}`}
                  type="button"
                  className="rounded-xl border p-3 text-left hover:bg-gray-50"
                  onClick={() => router.push(`/logistics/manual/${row.id}`)}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold truncate">{orderName}</p>
                      <p className="mt-1 text-xs text-gray-500">Order ID: {row.id}</p>
                      <p className="mt-1 text-xs text-gray-600">
                        {manual.customerName || "Customer"} · {String(row.status ?? "").replace("_", " ")}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold">{naira(Number(row.total ?? 0))}</p>
                      {isPending ? (
                        <button
                          type="button"
                          className="mt-2 rounded-lg bg-black px-3 py-1.5 text-xs text-white disabled:opacity-60"
                          onClick={(e) => {
                            e.stopPropagation();
                            acceptOrder(row.id);
                          }}
                          disabled={acceptingId === row.id}
                        >
                          {acceptingId === row.id ? "Accepting..." : "Accept order"}
                        </button>
                      ) : null}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {msg ? <div className="rounded-2xl border bg-white p-4 text-sm text-red-600">{msg}</div> : null}
    </main>
  );
}

