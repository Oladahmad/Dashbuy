"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import OrderTimeline from "@/components/OrderTimeline";
import Image from "next/image";

type TrackingPayload = {
  orderId: string;
  orderName: string;
  status: string | null;
  total: number;
  address: string;
  phone: string;
  customerName: string;
  itemsText: string;
  createdAt: string;
};

function naira(n: number) {
  return `N${Math.round(Number(n) || 0).toLocaleString()}`;
}

export default function PublicTrackingPage() {
  const params = useParams<{ orderId?: string }>();
  const orderId = String(params?.orderId ?? "");

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [data, setData] = useState<TrackingPayload | null>(null);

  useEffect(() => {
    let alive = true;

    async function load() {
      if (!orderId) return;
      const res = await fetch(`/api/track/${orderId}`, { cache: "no-store" });
      const body = (await res.json().catch(() => null)) as
        | { ok?: boolean; error?: string; tracking?: TrackingPayload }
        | null;

      if (!alive) return;
      if (!res.ok || !body?.ok || !body.tracking) {
        setMsg(body?.error ?? "Tracking not found");
        setData(null);
        setLoading(false);
        return;
      }

      setData(body.tracking);
      setMsg("");
      setLoading(false);
    }

    load();
    const t = setInterval(load, 15000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [orderId]);

  return (
    <main className="mx-auto max-w-xl p-4 space-y-4">
      <header className="rounded-2xl border bg-white p-4">
        <div className="flex items-center gap-3">
          <Image src="/logo.png" alt="Dashbuy" width={44} height={44} className="h-11 w-11 rounded-lg" />
          <div>
            <p className="text-sm text-gray-600">Powered by</p>
            <p className="text-lg font-semibold">Dashbuy</p>
          </div>
        </div>

        <div className="mt-4 rounded-xl border bg-gray-50 p-4">
          <p className="text-base font-semibold">Explore Dashbuy</p>
          <p className="mt-1 text-sm text-gray-700">
            Order food, shop products, and track every delivery in one place with fast local support.
          </p>
          <a
            href="/"
            className="mt-3 inline-flex w-full items-center justify-center rounded-xl bg-black px-4 py-3 text-sm font-medium text-white"
          >
            Continue to Dashbuy
          </a>
        </div>
      </header>

      <div className="rounded-2xl border bg-white p-4">
        <p className="text-lg font-semibold">Track delivery</p>
        <p className="mt-1 text-sm text-gray-600">Live updates from your logistics partner.</p>
      </div>

      {loading ? <div className="rounded-2xl border bg-white p-4 text-sm text-gray-600">Loading...</div> : null}
      {msg ? <div className="rounded-2xl border bg-white p-4 text-sm text-red-600">{msg}</div> : null}

      {data ? (
        <>
          <OrderTimeline
            status={data.status}
            title={data.orderName}
            subtitle={`Ref ${data.orderId.slice(0, 8)} · ${naira(data.total)}`}
          />

          <div className="rounded-2xl border bg-white p-4">
            <p className="font-semibold">Order details</p>
            <p className="mt-2 text-sm">Customer: {data.customerName || "Customer"}</p>
            <p className="mt-1 text-sm">Phone: {data.phone || "-"}</p>
            <p className="mt-1 text-sm">Address: {data.address || "-"}</p>
            <p className="mt-1 text-sm text-gray-600">Created: {new Date(data.createdAt).toLocaleString()}</p>
          </div>

          <div className="rounded-2xl border bg-white p-4">
            <p className="font-semibold">Items requested</p>
            <pre className="mt-2 whitespace-pre-wrap text-sm text-gray-700">{data.itemsText || "-"}</pre>
          </div>

          <footer className="rounded-2xl border bg-white p-4">
            <p className="text-sm text-gray-700">
              This delivery experience is powered by the Dashbuy × Sprint partnership.
            </p>
            <div className="mt-4 flex items-center justify-center gap-6">
              <Image src="/logo.png" alt="Dashbuy" width={96} height={96} className="h-20 w-20 rounded-xl object-contain" />
              <span className="text-xl font-semibold text-gray-500">X</span>
              <Image src="/sprintlogo.jpg" alt="Sprint" width={96} height={96} className="h-20 w-20 rounded-xl object-contain bg-white p-1" />
            </div>
          </footer>
        </>
      ) : null}
    </main>
  );
}
