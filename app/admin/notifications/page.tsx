"use client";

import { useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

type Audience =
  | "all"
  | "customers"
  | "vendors"
  | "vendor_food"
  | "vendor_products"
  | "logistics";

const presets = [
  {
    label: "Cart reminder",
    title: "You have items waiting in your cart",
    body: "Complete your checkout now before items go out of stock.",
    audience: "customers" as Audience,
    url: "/products/cart",
  },
  {
    label: "Food promo",
    title: "Fresh meals available now",
    body: "Open Dashbuy and order from food vendors around you.",
    audience: "customers" as Audience,
    url: "/food",
  },
  {
    label: "Vendor alert",
    title: "Keep your store updated",
    body: "Review your listings and update stock/availability now.",
    audience: "vendors" as Audience,
    url: "/vendor",
  },
];

export default function AdminNotificationsPage() {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [url, setUrl] = useState("/");
  const [audience, setAudience] = useState<Audience>("all");
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState("");
  const [sentCount, setSentCount] = useState<number | null>(null);

  function applyPreset(index: number) {
    const p = presets[index];
    if (!p) return;
    setTitle(p.title);
    setBody(p.body);
    setAudience(p.audience);
    setUrl(p.url);
  }

  async function onSend() {
    setSending(true);
    setMsg("");
    setSentCount(null);

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setMsg("Session expired. Please log in again.");
      setSending(false);
      return;
    }

    const res = await fetch("/api/admin/push/broadcast", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        title,
        body,
        audience,
        url,
      }),
    });

    const data = (await res.json().catch(() => null)) as
      | { ok?: boolean; error?: string; sentToUsers?: number }
      | null;

    if (!res.ok || !data?.ok) {
      setMsg(data?.error ?? "Could not send notification.");
      setSending(false);
      return;
    }

    setSentCount(Number(data.sentToUsers ?? 0));
    setMsg("Notification sent.");
    setSending(false);
  }

  const disabled = sending || !title.trim() || !body.trim();

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-lg font-semibold">Push Notifications</p>
            <p className="mt-1 text-sm text-gray-600">Send general alerts to app users.</p>
          </div>
          <Link href="/admin" className="rounded-xl border px-3 py-2 text-sm hover:bg-gray-50">
            Back
          </Link>
        </div>
      </div>

      <div className="rounded-2xl border bg-white p-4">
        <p className="text-sm font-semibold">Quick presets</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {presets.map((preset, idx) => (
            <button
              key={preset.label}
              type="button"
              className="rounded-xl border px-3 py-2 text-sm text-left hover:bg-gray-50"
              onClick={() => applyPreset(idx)}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border bg-white p-4 space-y-3">
        <div>
          <label className="text-sm font-medium">Audience</label>
          <select
            className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
            value={audience}
            onChange={(e) => setAudience(e.target.value as Audience)}
          >
            <option value="all">All users</option>
            <option value="customers">Customers only</option>
            <option value="vendors">All vendors</option>
            <option value="vendor_food">Food vendors</option>
            <option value="vendor_products">Product vendors</option>
            <option value="logistics">Logistics only</option>
          </select>
        </div>

        <div>
          <label className="text-sm font-medium">Title</label>
          <input
            className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="New update on Dashbuy"
          />
        </div>

        <div>
          <label className="text-sm font-medium">Message</label>
          <textarea
            className="mt-1 w-full rounded-xl border px-3 py-2 text-sm min-h-24"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Check your cart and complete checkout."
          />
        </div>

        <div>
          <label className="text-sm font-medium">Open URL (optional)</label>
          <input
            className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="/products/cart"
          />
        </div>

        <button
          type="button"
          className="w-full rounded-xl bg-black px-4 py-3 text-sm font-medium text-white disabled:opacity-60"
          disabled={disabled}
          onClick={onSend}
        >
          {sending ? "Sending..." : "Send Notification"}
        </button>

        {msg ? (
          <p className={`text-sm ${msg.toLowerCase().includes("sent") ? "text-green-700" : "text-red-600"}`}>
            {msg}
            {sentCount !== null ? ` (${sentCount} users)` : ""}
          </p>
        ) : null}
      </div>
    </div>
  );
}

