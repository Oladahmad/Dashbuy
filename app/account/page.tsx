"use client";

import { useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";
import { extractOrderNameFromNotes } from "@/lib/orderName";

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
  orders: OrderRow[];
  orderName: string;
};

type ProfileRow = {
  id: string;
  full_name: string | null;
  phone: string | null;
  address: string | null;
  wallet_pin_enabled?: boolean | null;
};

function naira(n: number) {
  return `N${Math.round(Number(n) || 0).toLocaleString()}`;
}

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function clean(s: string) {
  return s.trim();
}

function isBlank(s: string | null | undefined) {
  return !s || !clean(s);
}

function labelForOrder(o: Pick<OrderGroup, "order_type" | "food_mode">) {
  if (o.order_type === "mixed") return "Combined Order";
  if (o.order_type === "product") return "Product Order";
  if ((o.food_mode ?? "plate") === "combo") return "Food Combo Order";
  return "Food Plate Order";
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

function groupOrders(rows: OrderRow[]) {
  const groups = new Map<string, OrderRow[]>();
  for (const row of rows) {
    const key = row.paystack_reference?.trim() || row.id;
    const existing = groups.get(key) ?? [];
    existing.push(row);
    groups.set(key, existing);
  }

  return Array.from(groups.values())
    .map((group): OrderGroup => {
      const sorted = [...group].sort((a, b) => b.created_at.localeCompare(a.created_at));
      const primary = sorted[0];
      const types = Array.from(new Set(sorted.map((o) => o.order_type)));
      const orderType = types.length > 1 ? "mixed" : primary.order_type;
      const foodModes = Array.from(new Set(sorted.map((o) => o.food_mode).filter(Boolean)));

      return {
        id: primary.id,
        order_type: orderType,
        food_mode: orderType === "food" && foodModes.length === 1 ? (foodModes[0] as "plate" | "combo") : null,
        status: groupStatus(sorted),
        total: sorted.reduce((sum, item) => sum + Number(item.total ?? 0), 0),
        created_at: primary.created_at,
        orders: sorted,
        orderName: sorted.map((row) => extractOrderNameFromNotes(row.notes)).find((name) => name.length > 0) ?? "",
      };
    })
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export default function AccountPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [pinToast, setPinToast] = useState("");
  const [userEmail, setUserEmail] = useState<string>("");
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [editing, setEditing] = useState(false);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [saving, setSaving] = useState(false);
  const [pinEnabled, setPinEnabled] = useState(false);
  const [settingPin, setSettingPin] = useState(false);
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [pinMsg, setPinMsg] = useState("");
  const [pinSaving, setPinSaving] = useState(false);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [orders, setOrders] = useState<OrderGroup[]>([]);
  const [walletBalance, setWalletBalance] = useState(0);

  const requiredMissing = useMemo(() => {
    if (!profile) return true;
    return isBlank(profile.full_name) || isBlank(profile.phone) || isBlank(profile.address);
  }, [profile]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setMsg("");

      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData.session?.user;

      if (!user) {
        router.push("/auth/login");
        return;
      }

      setUserEmail(user.email ?? "");

      const { data: prof, error: profErr } = await supabase
        .from("profiles")
        .select("id, full_name, phone, address, wallet_pin_enabled")
        .eq("id", user.id)
        .maybeSingle<ProfileRow>();

      if (profErr) {
        setMsg(profErr.message);
      } else {
        const row: ProfileRow = prof ?? { id: user.id, full_name: null, phone: null, address: null };
        setProfile(row);
        setPinEnabled(!!row.wallet_pin_enabled);
        setFullName(row.full_name ?? "");
        setPhone(row.phone ?? "");
        setAddress(row.address ?? "");
        const missing = isBlank(row.full_name) || isBlank(row.phone) || isBlank(row.address);
        setEditing(missing);
      }

      setOrdersLoading(true);

      const { data: ord, error: ordErr } = await supabase
        .from("orders")
        .select("id,order_type,food_mode,status,total,created_at,paystack_reference,notes")
        .eq("customer_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50);

      if (ordErr) {
        setOrders([]);
      } else {
        const rows = (ord as OrderRow[]) ?? [];
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
        setOrders(groupOrders(rows).slice(0, 3));
      }

      setOrdersLoading(false);
      setLoading(false);
    })();
  }, [router]);

  useEffect(() => {
    (async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token ?? "";
      if (!token) return;
      const res = await fetch("/api/wallet/balance", {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = (await res.json().catch(() => null)) as { ok?: boolean; balance?: number } | null;
      if (res.ok && body?.ok) setWalletBalance(Number(body.balance ?? 0));
    })();
  }, []);

  useEffect(() => {
    if (!pinToast) return;
    const timer = window.setTimeout(() => setPinToast(""), 2200);
    return () => window.clearTimeout(timer);
  }, [pinToast]);

  const canSave = useMemo(() => {
    if (!editing) return false;
    if (!clean(fullName)) return false;
    if (!clean(phone)) return false;
    if (!clean(address)) return false;
    return true;
  }, [editing, fullName, phone, address]);

  function onEdit() {
    setMsg("");
    setEditing(true);
  }

  function onCancelEdit() {
    if (!profile) return;
    setMsg("");
    setFullName(profile.full_name ?? "");
    setPhone(profile.phone ?? "");
    setAddress(profile.address ?? "");
    if (requiredMissing) setEditing(true);
    else setEditing(false);
  }

  async function saveProfile() {
    setMsg("");

    if (!clean(fullName)) return setMsg("Full name is required.");
    if (!clean(phone)) return setMsg("Phone number is required.");
    if (!clean(address)) return setMsg("Delivery address is required.");

    setSaving(true);

    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData.session?.user;

    if (!user) {
      setSaving(false);
      router.push("/auth/login");
      return;
    }

    const payload = {
      id: user.id,
      full_name: clean(fullName),
      phone: clean(phone),
      address: clean(address),
    };

    const { error } = await supabase.from("profiles").upsert(payload);

    setSaving(false);
    if (error) return setMsg(error.message);

    setProfile({ ...profile, ...payload, wallet_pin_enabled: pinEnabled });
    setMsg("Profile updated.");
    setEditing(false);
    window.setTimeout(() => setMsg(""), 1600);
  }

  async function resetPassword() {
    setMsg("");
    router.push("/auth/reset-password");
  }

  async function logout() {
    await supabase.auth.signOut();
    router.push("/auth/login");
  }

  async function saveWalletPin() {
    setPinMsg("");
    setPinSaving(true);

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token ?? "";
    if (!token) {
      setPinSaving(false);
      router.push("/auth/login");
      return;
    }

    const res = await fetch("/api/wallet/pin", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        currentPin,
        newPin,
        confirmPin,
      }),
    });
    const body = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
    setPinSaving(false);
    if (!res.ok || !body?.ok) {
      setPinMsg(body?.error ?? "Unable to save wallet PIN.");
      return;
    }

    setPinEnabled(true);
    setSettingPin(false);
    setCurrentPin("");
    setNewPin("");
    setConfirmPin("");
    setPinMsg("");
    setPinToast(pinEnabled ? "Wallet PIN updated." : "Wallet PIN saved.");
  }

  return (
    <AppShell title="Account">
      {pinToast ? (
        <div className="fixed left-1/2 top-4 z-40 -translate-x-1/2 rounded-full bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-lg">
          {pinToast}
        </div>
      ) : null}

      {loading ? (
        <div className="rounded-2xl border bg-white p-5 text-sm text-gray-600">Loading account...</div>
      ) : (
        <>
          <div className="rounded-3xl border bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-sm font-medium uppercase tracking-[0.16em] text-gray-500">Profile</p>
                <p className="mt-2 text-2xl font-semibold text-gray-900">{profile?.full_name ?? "Complete your profile"}</p>
                <p className="mt-1 text-sm text-gray-600">{userEmail}</p>
                {requiredMissing ? (
                  <p className="mt-2 inline-flex rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
                    Complete your profile to checkout faster
                  </p>
                ) : null}
              </div>

              <div className="flex flex-wrap gap-2">
                {!editing && !requiredMissing ? (
                  <button className="rounded-full border px-4 py-2 text-sm font-medium" onClick={onEdit} type="button">
                    Edit profile
                  </button>
                ) : null}
              </div>
            </div>

            <div className="mt-5">
              {!editing ? (
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl border p-4">
                    <p className="text-xs font-medium uppercase tracking-[0.14em] text-gray-500">Full name</p>
                    <p className="mt-2 text-sm text-gray-900">{profile?.full_name ?? "Not set"}</p>
                  </div>
                  <div className="rounded-2xl border p-4">
                    <p className="text-xs font-medium uppercase tracking-[0.14em] text-gray-500">Phone number</p>
                    <p className="mt-2 text-sm text-gray-900">{profile?.phone ?? "Not set"}</p>
                  </div>
                  <div className="rounded-2xl border p-4">
                    <p className="text-xs font-medium uppercase tracking-[0.14em] text-gray-500">Delivery address</p>
                    <p className="mt-2 text-sm whitespace-pre-wrap text-gray-900">{profile?.address ?? "Not set"}</p>
                  </div>
                </div>
              ) : (
                <div className="grid gap-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <p className="text-sm font-medium">Full name</p>
                      <input
                        className="mt-2 w-full rounded-2xl border p-3"
                        placeholder="Your name"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                      />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Phone number</p>
                      <input
                        className="mt-2 w-full rounded-2xl border p-3"
                        placeholder="e.g. 08012345678"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                      />
                    </div>
                  </div>
                  <div>
                    <p className="text-sm font-medium">Delivery address</p>
                    <textarea
                      className="mt-2 w-full rounded-2xl border p-3"
                      placeholder="Enter your delivery address"
                      rows={3}
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      className="rounded-full border px-4 py-2 text-sm font-medium"
                      onClick={onCancelEdit}
                      disabled={saving}
                      type="button"
                    >
                      Cancel
                    </button>
                    <button
                      className="rounded-full bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                      onClick={saveProfile}
                      disabled={saving || !canSave}
                      type="button"
                    >
                      {saving ? "Saving..." : "Save profile"}
                    </button>
                  </div>
                </div>
              )}

              {msg ? <p className="mt-3 text-sm text-orange-600">{msg}</p> : null}
            </div>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
            <div className="rounded-3xl border bg-white p-5 shadow-sm">
              <div>
                <p className="text-lg font-semibold">Wallet</p>
                <p className="mt-1 text-sm text-gray-600">Rejected order refunds and added funds go into one wallet balance.</p>
              </div>

              <div className="mt-4 rounded-2xl border bg-gray-50 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.14em] text-gray-500">Available balance</p>
                    <p className="mt-2 text-3xl font-semibold text-gray-900">{naira(walletBalance)}</p>
                  </div>
                  <button
                    className={`rounded-full px-3 py-1.5 text-xs font-medium text-white ${pinEnabled ? "bg-black" : "bg-black"}`}
                    type="button"
                    onClick={() => {
                      setSettingPin(true);
                      setPinMsg("");
                    }}
                  >
                    {pinEnabled ? "Reset PIN" : "Set PIN"}
                  </button>
                </div>
              </div>

              <div className="mt-4 rounded-2xl border p-4">
                <p className="text-sm font-semibold text-gray-900">Wallet PIN</p>
                <p className="mt-1 text-sm text-gray-600">
                  {pinEnabled
                    ? "Your wallet PIN is active. Only reset it when you want to change it."
                    : "Set a 4-digit PIN before wallet payments can go through."}
                </p>

                {settingPin ? (
                  <div className="mt-4 grid gap-3">
                    {pinEnabled ? (
                      <div>
                        <p className="text-sm font-medium">Current PIN</p>
                        <input
                          className="mt-2 w-full rounded-2xl border p-3"
                          inputMode="numeric"
                          maxLength={4}
                          placeholder="Enter current 4-digit PIN"
                          value={currentPin}
                          onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                        />
                      </div>
                    ) : null}

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <p className="text-sm font-medium">New PIN</p>
                        <input
                          className="mt-2 w-full rounded-2xl border p-3"
                          inputMode="numeric"
                          maxLength={4}
                          placeholder="Enter new 4-digit PIN"
                          value={newPin}
                          onChange={(e) => setNewPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                        />
                      </div>
                      <div>
                        <p className="text-sm font-medium">Confirm PIN</p>
                        <input
                          className="mt-2 w-full rounded-2xl border p-3"
                          inputMode="numeric"
                          maxLength={4}
                          placeholder="Confirm new 4-digit PIN"
                          value={confirmPin}
                          onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                        />
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        className="rounded-full border px-4 py-2 text-sm font-medium"
                        type="button"
                        onClick={() => {
                          setSettingPin(false);
                          setCurrentPin("");
                          setNewPin("");
                          setConfirmPin("");
                          setPinMsg("");
                        }}
                        disabled={pinSaving}
                      >
                        Cancel
                      </button>
                      <button
                        className="rounded-full bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                        type="button"
                        onClick={saveWalletPin}
                        disabled={pinSaving}
                      >
                        {pinSaving ? "Saving..." : pinEnabled ? "Update PIN" : "Save PIN"}
                      </button>
                    </div>
                  </div>
                ) : null}

                {pinMsg ? <p className="mt-3 text-sm text-orange-600">{pinMsg}</p> : null}
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  className="rounded-3xl border border-stone-200 bg-stone-50 px-4 py-3 text-center text-sm font-semibold text-stone-800 shadow-sm transition hover:-translate-y-0.5 hover:bg-white hover:shadow-md"
                  type="button"
                  onClick={() => router.push("/account/add-funds")}
                >
                  Add funds
                </button>
                <button
                  className="rounded-3xl border border-stone-200 bg-stone-50 px-4 py-3 text-center text-sm font-semibold text-stone-800 shadow-sm transition hover:-translate-y-0.5 hover:bg-white hover:shadow-md"
                  type="button"
                  onClick={() => router.push("/account/withdraw")}
                >
                  Withdraw funds
                </button>
              </div>
            </div>

            <div className="rounded-3xl border bg-white p-5 shadow-sm">
              <p className="text-lg font-semibold">Sell on Dashbuy</p>
              <p className="mt-1 text-sm text-gray-600">Want to upload products or food? Become a vendor and start selling.</p>
              <div className="mt-4 grid grid-cols-2 overflow-hidden rounded-3xl border border-stone-900">
                <button
                  className="bg-stone-900 px-4 py-3 text-center text-sm font-semibold text-white transition hover:bg-black"
                  onClick={() => router.push("/auth/vendor-signup")}
                  type="button"
                >
                  Become a vendor
                </button>
                <button
                  className="border-l border-stone-900 bg-white px-4 py-3 text-center text-sm font-semibold text-stone-900 transition hover:bg-stone-50"
                  onClick={() => router.push("/about")}
                  type="button"
                >
                  About Dashbuy
                </button>
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-3xl border bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-lg font-semibold">Your orders</p>
                <p className="mt-1 text-sm text-gray-600">Showing your latest 3 orders.</p>
              </div>
              <button className="text-sm font-medium text-orange-600 underline" type="button" onClick={() => router.push("/orders")}>
                View all orders
              </button>
            </div>

            {ordersLoading ? (
              <div className="mt-3 text-sm text-gray-600">Loading orders...</div>
            ) : orders.length === 0 ? (
              <div className="mt-3 text-sm text-gray-600">No orders yet.</div>
            ) : (
              <div className="mt-4 grid gap-3">
                {orders.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => router.push(`/orders/${o.id}`)}
                    className="rounded-2xl border p-4 text-left hover:bg-gray-50"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-semibold text-gray-900">{o.orderName || labelForOrder(o)}</p>
                      <p className="font-bold text-gray-900">{naira(o.total ?? 0)}</p>
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-3 text-sm text-gray-600">
                      <span>{friendlyStatus(o.status)}</span>
                      <span>{fmtDate(o.created_at)}</span>
                    </div>
                    <p className="mt-1 text-xs text-gray-500">{typeForOrder(o)}</p>
                    {o.orders.length > 1 ? (
                      <p className="mt-1 text-xs text-gray-500">{o.orders.length} vendor orders in this purchase</p>
                    ) : null}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="mt-4 rounded-3xl border bg-white p-5 shadow-sm">
            <p className="text-lg font-semibold">Support and legal</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <button
                className="rounded-2xl border px-4 py-3 text-center"
                onClick={() => router.push("/terms/customer")}
                type="button"
              >
                <p className="font-medium">Customer Terms and Conditions</p>
              </button>
              <button className="rounded-2xl border px-4 py-3 text-center" onClick={logout} type="button">
                <p className="font-medium">Log out</p>
              </button>
              <button className="rounded-2xl border px-4 py-3 text-center" onClick={resetPassword} type="button">
                <p className="font-medium">Reset password</p>
              </button>
              <a
                className="rounded-2xl border px-4 py-3 text-center"
                href="https://wa.me/2347057602937"
                target="_blank"
                rel="noreferrer"
              >
                <p className="font-medium">Contact support</p>
              </a>
            </div>
          </div>

          <div className="h-3" />
        </>
      )}
    </AppShell>
  );
}
