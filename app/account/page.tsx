"use client";

import { useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

type OrderRow = {
  id: string;
  order_type: "food" | "product";
  food_mode: "plate" | "combo" | null;
  status: string | null;
  total: number | null;
  created_at: string;
  paystack_reference: string | null;
};

type OrderGroup = {
  id: string;
  order_type: "food" | "product" | "mixed";
  food_mode: "plate" | "combo" | null;
  status: string | null;
  total: number;
  created_at: string;
  orders: OrderRow[];
};

type ProfileRow = {
  id: string;
  full_name: string | null;
  phone: string | null;
  address: string | null;
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
      };
    })
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export default function AccountPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  const [userEmail, setUserEmail] = useState<string>("");

  const [profile, setProfile] = useState<ProfileRow | null>(null);

  const [editing, setEditing] = useState(false);

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");

  const [saving, setSaving] = useState(false);

  const [ordersLoading, setOrdersLoading] = useState(false);
  const [orders, setOrders] = useState<OrderGroup[]>([]);

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
        .select("id, full_name, phone, address")
        .eq("id", user.id)
        .maybeSingle<ProfileRow>();

      if (profErr) {
        setMsg(profErr.message);
      } else {
        const row: ProfileRow = prof ?? { id: user.id, full_name: null, phone: null, address: null };
        setProfile(row);

        setFullName(row.full_name ?? "");
        setPhone(row.phone ?? "");
        setAddress(row.address ?? "");

        const missing = isBlank(row.full_name) || isBlank(row.phone) || isBlank(row.address);
        setEditing(missing);
      }

      setOrdersLoading(true);

      const { data: ord, error: ordErr } = await supabase
        .from("orders")
        .select("id,order_type,food_mode,status,total,created_at,paystack_reference")
        .eq("customer_id", user.id)
        .order("created_at", { ascending: false })
        .limit(12);

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

    setProfile({  ...payload });
    setMsg("Saved");
    setEditing(false);

    setTimeout(() => setMsg(""), 1200);
  }

  async function resetPassword() {
    setMsg("");
    if (!userEmail) return setMsg("No email found for this account.");

    const redirectTo = `${window.location.origin}/auth/reset-password`;
    const { error } = await supabase.auth.resetPasswordForEmail(userEmail, { redirectTo });

    if (error) return setMsg(error.message);
    setMsg("Password reset link sent Check your email.");
  }

  async function logout() {
    await supabase.auth.signOut();
    router.push("/auth/login");
  }

  return (
    <AppShell title="Account">
      {loading ? (
        <div className="rounded-2xl border bg-white p-5 text-sm text-gray-600">Loading account...</div>
      ) : (
        <>
          <div className="rounded-2xl border bg-white p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-lg font-semibold">Profile</p>
                <p className="mt-1 text-sm text-gray-600">{userEmail}</p>
                {requiredMissing ? (
                  <p className="mt-1 text-xs text-amber-700">Complete your profile to checkout faster</p>
                ) : null}
              </div>

              {!editing && !requiredMissing ? (
                <button className="rounded-xl border px-3 py-2 text-sm" onClick={onEdit} type="button">
                  Edit
                </button>
              ) : null}

              {editing ? (
                <div className="flex gap-2">
                  <button
                    className="rounded-xl border px-3 py-2 text-sm"
                    onClick={onCancelEdit}
                    disabled={saving}
                    type="button"
                  >
                    Cancel
                  </button>

                  <button
                    className="rounded-xl border px-3 py-2 text-sm"
                    onClick={saveProfile}
                    disabled={saving || !canSave}
                    type="button"
                  >
                    {saving ? "Saving..." : "Save"}
                  </button>
                </div>
              ) : null}
            </div>

            <div className="mt-4">
              {!editing ? (
                <div className="space-y-3">
                  <div className="border-b pb-3">
                    <p className="text-xs text-gray-600">Full name</p>
                    <p className="text-sm">{profile?.full_name ?? "Not set"}</p>
                  </div>

                  <div className="border-b pb-3">
                    <p className="text-xs text-gray-600">Phone number</p>
                    <p className="text-sm">{profile?.phone ?? "Not set"}</p>
                  </div>

                  <div>
                    <p className="text-xs text-gray-600">Delivery address</p>
                    <p className="text-sm whitespace-pre-wrap">{profile?.address ?? "Not set"}</p>
                  </div>
                </div>
              ) : (
                <div className="grid gap-3">
                  <div>
                    <p className="text-sm font-medium">Full name</p>
                    <input
                      className="mt-2 w-full rounded-xl border p-3"
                      placeholder="Your name"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                    />
                  </div>

                  <div>
                    <p className="text-sm font-medium">Phone number</p>
                    <input
                      className="mt-2 w-full rounded-xl border p-3"
                      placeholder="e.g. 08012345678"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                    />
                  </div>

                  <div>
                    <p className="text-sm font-medium">Delivery address</p>
                    <textarea
                      className="mt-2 w-full rounded-xl border p-3"
                      placeholder="Enter your delivery address"
                      rows={3}
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                    />
                  </div>
                </div>
              )}

              {msg ? <p className="mt-3 text-sm text-orange-600">{msg}</p> : null}
            </div>
          </div>

          <div className="mt-4 rounded-2xl border bg-white p-5">
            <div className="flex items-center justify-between">
              <p className="text-lg font-semibold">Your orders</p>
              <button
                className="text-sm text-orange-600 underline"
                type="button"
                onClick={() => router.push("/orders")}
              >
                View all
              </button>
            </div>

            <p className="mt-1 text-sm text-gray-600">Showing your latest 3 orders.</p>

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
                    <div className="flex items-center justify-between">
                      <p className="font-semibold">{labelForOrder(o)}</p>
                      <p className="font-bold">{naira(o.total ?? 0)}</p>
                    </div>

                     <div className="mt-1 flex items-center justify-between text-sm text-gray-600">
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

          <div className="mt-4 rounded-2xl border bg-white p-5">
            <p className="text-lg font-semibold">Sell on Dashbuy</p>
            <p className="mt-1 text-sm text-gray-600">Want to upload products or food? Become a vendor and start selling.</p>

            <button
              className="mt-3 w-full rounded-xl bg-black px-4 py-3 text-white"
              onClick={() => router.push("/auth/vendor-signup")}
              type="button"
            >
              Become a vendor →
            </button>
          </div>

          <div className="mt-4 rounded-2xl border bg-white p-5">
            <p className="text-lg font-semibold">Help & About</p>

            <div className="mt-3 grid gap-2">
              <button
                className="rounded-xl border px-4 py-3 text-left"
                onClick={() => router.push("/about")}
                type="button"
              >
                <p className="font-medium">About Dashbuy</p>
                <p className="text-sm text-gray-600">What Dashbuy is and how it works</p>
              </button>

              <a
                className="rounded-xl border px-4 py-3 block"
                href="https://wa.me/2347057602937"
                target="_blank"
                rel="noreferrer"
              >
                <p className="font-medium">Contact Support</p>
                <p className="text-sm text-gray-600">Chat with us on WhatsApp</p>
              </a>
            </div>
          </div>

          <button className="mt-4 w-full rounded-xl border px-4 py-3" onClick={resetPassword} type="button">
            Reset password
          </button>

          <button className="mt-3 w-full rounded-xl bg-black px-4 py-3 text-white" onClick={logout} type="button">
            Log out
          </button>

          <div className="h-3" />
        </>
      )}
    </AppShell>
  );
}
