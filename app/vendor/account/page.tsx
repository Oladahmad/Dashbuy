"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type Role = "customer" | "vendor_food" | "vendor_products" | "admin";

type ProfileRow = {
  id: string;
  role: Role;
  full_name: string | null;
  phone: string | null;
  address: string | null;
  store_name: string | null;

  logo_url: string | null;

  bank_name: string | null;
  bank_account_number: string | null;
  bank_account_name: string | null;
};

type PayoutRow = {
  id: string;
  amount: number;
  created_at: string;
  reference: string | null;
};

function clean(s: string) {
  return s.trim();
}

function isBlank(s: string | null | undefined) {
  return !s || !clean(s);
}

function isVendorRole(role: Role) {
  return role === "vendor_food" || role === "vendor_products" || role === "admin";
}

function roleLabel(role: Role) {
  if (role === "vendor_food") return "Food vendor";
  if (role === "vendor_products") return "Products vendor";
  if (role === "admin") return "Admin";
  return "Customer";
}

function initialsFromName(a: string) {
  const t = clean(a);
  if (!t) return "DB";
  const parts = t.split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? "" : "";
  const out = (first + last).toUpperCase();
  return out || "DB";
}

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

function fileExt(name: string) {
  const i = name.lastIndexOf(".");
  if (i < 0) return "jpg";
  return name.slice(i + 1).toLowerCase();
}

function nowId() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

export default function VendorAccountPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [editing, setEditing] = useState(false);

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [storeName, setStoreName] = useState("");
  const [address, setAddress] = useState("");

  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);

  const [bankName, setBankName] = useState("");
  const [bankAccountNumber, setBankAccountNumber] = useState("");
  const [bankAccountName, setBankAccountName] = useState("");

  const [showPayouts, setShowPayouts] = useState(false);
  const [payoutsLoading, setPayoutsLoading] = useState(false);
  const [payouts, setPayouts] = useState<PayoutRow[]>([]);

  const canUseVendorPage = useMemo(() => {
    return profile ? isVendorRole(profile.role) : false;
  }, [profile]);

  const requiredMissing = useMemo(() => {
    if (!profile) return true;

    const baseMissing = isBlank(profile.full_name) || isBlank(profile.phone) || isBlank(profile.address);

    if (profile.role === "vendor_food" || profile.role === "vendor_products") {
      return baseMissing || isBlank(profile.store_name);
    }

    return baseMissing;
  }, [profile]);

  const avatarText = useMemo(() => {
    const base = profile?.store_name || profile?.full_name || "Dashbuy";
    return initialsFromName(base);
  }, [profile]);

  useEffect(() => {
    let alive = true;

    async function load() {
      setLoading(true);
      setErr(null);
      setOk(null);

      const { data: u, error: uerr } = await supabase.auth.getUser();
      if (uerr) {
        if (alive) {
          setErr(uerr.message);
          setLoading(false);
        }
        return;
      }

      const user = u.user;
      if (!user) {
        if (alive) {
          setErr("Not signed in");
          setLoading(false);
        }
        return;
      }

      const { data, error } = await supabase
        .from("profiles")
        .select(
          "id,role,full_name,phone,address,store_name,logo_url,bank_name,bank_account_number,bank_account_name"
        )
        .eq("id", user.id)
        .maybeSingle<ProfileRow>();

      if (!alive) return;

      if (error) {
        setErr(error.message);
        setLoading(false);
        return;
      }

      if (!data) {
        setErr("Profile not found");
        setLoading(false);
        return;
      }

      setProfile(data);

      setFullName(data.full_name ?? "");
      setPhone(data.phone ?? "");
      setStoreName(data.store_name ?? "");
      setAddress(data.address ?? "");

      setBankName(data.bank_name ?? "");
      setBankAccountNumber(data.bank_account_number ?? "");
      setBankAccountName(data.bank_account_name ?? "");

      const canUse = isVendorRole(data.role);
      if (!canUse) {
        setEditing(false);
      } else {
        const missing =
          isBlank(data.full_name) || isBlank(data.phone) || isBlank(data.address) ||
          ((data.role === "vendor_food" || data.role === "vendor_products") && isBlank(data.store_name));
        setEditing(missing);
      }

      setLoading(false);
    }

    load();

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!logoFile) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLogoPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(logoFile);
    setLogoPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [logoFile]);

  const canSave = useMemo(() => {
    if (!profile) return false;
    if (!canUseVendorPage) return false;
    if (!editing) return false;

    const n = clean(fullName);
    const p = clean(phone);
    const a = clean(address);

    if (!n) return false;
    if (!p) return false;
    if (!a) return false;

    if (profile.role === "vendor_food" || profile.role === "vendor_products") {
      const sn = clean(storeName);
      if (!sn) return false;
    }

    return true;
  }, [profile, canUseVendorPage, editing, fullName, phone, address, storeName]);

  async function uploadVendorLogo(file: File, userId: string) {
    const ext = fileExt(file.name);
    const path = `vendors/${userId}/logo/${nowId()}.${ext}`;

    const up = await supabase.storage.from("vendor-logos").upload(path, file, {
      upsert: true,
      contentType: file.type || "image/jpeg",
    });

    if (up.error) throw new Error(up.error.message);

    const pub = supabase.storage.from("vendor-logos").getPublicUrl(path);
    const url = pub.data.publicUrl;
    if (!url) throw new Error("Could not get logo public URL");

    return url;
  }

  async function onSave() {
    setErr(null);
    setOk(null);

    if (!profile) {
      setErr("Profile not loaded");
      return;
    }

    if (!canUseVendorPage) {
      setErr("You do not have access to vendor settings");
      return;
    }

    const n = clean(fullName);
    const p = clean(phone);
    const a = clean(address);
    const sn = clean(storeName);

    if (!n || !p || !a) {
      setErr("Full name, phone, and address are required");
      return;
    }

    if ((profile.role === "vendor_food" || profile.role === "vendor_products") && !sn) {
      setErr("Store name is required for vendors");
      return;
    }

    setSaving(true);

    let logoUrl: string | null = profile.logo_url ?? null;
    const { data: u } = await supabase.auth.getUser();
    const user = u?.user;

    if (logoFile && user) {
      try {
        logoUrl = await uploadVendorLogo(logoFile, user.id);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (e: any) {
        setSaving(false);
        setErr(e?.message || "Logo upload failed");
        return;
      }
    }

    const payload: Record<string, unknown> = {
      full_name: n,
      phone: p,
      address: a,
      store_name: profile.role === "vendor_food" || profile.role === "vendor_products" ? sn : null,

      logo_url: logoUrl,

      bank_name: clean(bankName) ? clean(bankName) : null,
      bank_account_number: clean(bankAccountNumber) ? clean(bankAccountNumber) : null,
      bank_account_name: clean(bankAccountName) ? clean(bankAccountName) : null,
    };

    const { error } = await supabase.from("profiles").update(payload).eq("id", profile.id);

    if (error) {
      setSaving(false);
      setErr(error.message);
      return;
    }

    const nextProfile = { ...profile, ...payload } as ProfileRow;
    setProfile(nextProfile);

    setSaving(false);
    setOk("Saved");
    setEditing(false);
    setLogoFile(null);
  }

  function onEdit() {
    setErr(null);
    setOk(null);
    setEditing(true);
  }

  function onCancelEdit() {
    if (!profile) return;
    setErr(null);
    setOk(null);

    setFullName(profile.full_name ?? "");
    setPhone(profile.phone ?? "");
    setStoreName(profile.store_name ?? "");
    setAddress(profile.address ?? "");

    setBankName(profile.bank_name ?? "");
    setBankAccountNumber(profile.bank_account_number ?? "");
    setBankAccountName(profile.bank_account_name ?? "");

    setLogoFile(null);

    if (requiredMissing) setEditing(true);
    else setEditing(false);
  }

  async function onResetPassword() {
    setErr(null);
    setOk(null);
    router.push("/auth/reset-password");
  }

  async function onLogout() {
    setErr(null);
    setOk(null);
    await supabase.auth.signOut();
    router.replace("/auth/login");
  }

  async function onDeleteRequest() {
    setErr(null);
    setOk(null);
    setOk("Delete request sent. Support will contact you.");
  }

  async function loadPayoutsInline() {
    if (payoutsLoading) return;

    setPayoutsLoading(true);
    setErr(null);

    const { data: u } = await supabase.auth.getUser();
    const user = u?.user;
    if (!user) {
      setPayoutsLoading(false);
      setErr("Not signed in");
      return;
    }

    const { data, error } = await supabase
      .from("vendor_payouts")
      .select("id,amount,created_at,reference")
      .eq("vendor_id", user.id)
      .order("created_at", { ascending: false })
      .limit(10);

    setPayoutsLoading(false);

    if (error) {
      setErr(error.message);
      return;
    }

    setPayouts((data as PayoutRow[]) ?? []);
  }

  const showLogo = profile?.logo_url || logoPreviewUrl;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border bg-white p-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-gray-600">Vendor account</p>
          <p className="text-base font-semibold">{profile ? roleLabel(profile.role) : "Vendor"}</p>
          {profile && canUseVendorPage && requiredMissing ? (
            <p className="mt-1 text-xs text-amber-700">Complete your profile to start receiving orders</p>
          ) : null}
        </div>

        {profile && canUseVendorPage && !editing && !requiredMissing ? (
          <button type="button" className="rounded-xl border px-4 py-2 text-sm" onClick={onEdit}>
            Edit
          </button>
        ) : null}
      </div>

      {loading ? (
        <div className="rounded-2xl border bg-white p-4 text-sm text-gray-600">Loading…</div>
      ) : null}

      {err ? <div className="rounded-2xl border bg-white p-4 text-sm text-red-600">{err}</div> : null}
      {ok ? <div className="rounded-2xl border bg-white p-4 text-sm text-green-700">{ok}</div> : null}

      {!loading && profile && !canUseVendorPage ? (
        <div className="rounded-2xl border bg-white p-4 text-sm text-red-600">
          You do not have access to vendor settings
        </div>
      ) : null}

      {!loading && profile && canUseVendorPage ? (
        <>
          {/* Profile */}
          <div className="rounded-2xl border bg-white p-4">
            <div className="flex items-center justify-between">
              <p className="font-semibold">Profile</p>

              {editing ? (
                <button
                  type="button"
                  className="rounded-xl border px-4 py-2 text-sm"
                  onClick={onCancelEdit}
                  disabled={saving}
                >
                  Cancel
                </button>
              ) : null}
            </div>

            <div className="mt-4 flex items-center gap-3">
              {showLogo ? (
                <img
                  src={logoPreviewUrl || (profile.logo_url as string)}
                  alt="Logo"
                  className="h-14 w-14 rounded-2xl object-cover border"
                />
              ) : (
                <div className="h-14 w-14 rounded-2xl border bg-gray-50 flex items-center justify-center text-sm font-semibold">
                  {avatarText}
                </div>
              )}

              <div className="min-w-0">
                <p className="text-sm font-semibold truncate">{profile.store_name || profile.full_name || "Dashbuy"}</p>
                <p className="text-xs text-gray-600 truncate">{profile.address || "Address not set"}</p>
              </div>
            </div>

            {!editing ? (
              <div className="mt-4 space-y-3">
                <div className="border-b pb-3">
                  <p className="text-xs text-gray-600">Full name</p>
                  <p className="text-sm">{profile.full_name ?? "Not set"}</p>
                </div>

                <div className="border-b pb-3">
                  <p className="text-xs text-gray-600">Phone</p>
                  <p className="text-sm">{profile.phone ?? "Not set"}</p>
                </div>

                <div className="border-b pb-3">
                  <p className="text-xs text-gray-600">Store name</p>
                  <p className="text-sm">{profile.store_name ?? "Not set"}</p>
                </div>

                <div>
                  <p className="text-xs text-gray-600">Address</p>
                  <p className="text-sm whitespace-pre-wrap">{profile.address ?? "Not set"}</p>
                </div>
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                <div>
                  <label className="text-sm text-gray-700">Logo (optional)</label>
                  <input
                    className="mt-2 w-full rounded-xl border px-3 py-3"
                    type="file"
                    accept="image/*"
                    onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)}
                    disabled={saving}
                  />
                  <p className="mt-1 text-xs text-gray-500">If you skip this, customers will see your initials.</p>
                </div>

                <div>
                  <label className="text-sm text-gray-700">Full name</label>
                  <input
                    className="mt-1 w-full rounded-xl border px-3 py-3"
                    placeholder="Enter your full name"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    disabled={saving}
                  />
                </div>

                <div>
                  <label className="text-sm text-gray-700">Phone</label>
                  <input
                    className="mt-1 w-full rounded-xl border px-3 py-3"
                    placeholder="Enter your phone number"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    inputMode="tel"
                    disabled={saving}
                  />
                </div>

                <div>
                  <label className="text-sm text-gray-700">Store name</label>
                  <input
                    className="mt-1 w-full rounded-xl border px-3 py-3"
                    placeholder="Enter your store name"
                    value={storeName}
                    onChange={(e) => setStoreName(e.target.value)}
                    disabled={saving}
                  />
                </div>

                <div>
                  <label className="text-sm text-gray-700">Address</label>
                  <textarea
                    className="mt-1 w-full rounded-xl border px-3 py-3"
                    placeholder="Enter your pickup or store address"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    rows={3}
                    disabled={saving}
                  />
                </div>

                <button
                  type="button"
                  className="w-full rounded-xl bg-black px-4 py-3 text-white disabled:opacity-50"
                  disabled={!canSave || saving}
                  onClick={onSave}
                >
                  {saving ? "Saving…" : "Save changes"}
                </button>
              </div>
            )}
          </div>

          {/* Payout */}
          <div className="rounded-2xl border bg-white p-4 space-y-3">
            <p className="font-semibold">Withdrawal</p>
            <p className="text-sm text-gray-600">
              Withdraw your settled earnings to any bank account. Bank details are entered on the withdrawal page.
            </p>

            <button
              type="button"
              className="w-full rounded-xl bg-black px-4 py-3 text-sm text-white"
              onClick={() => router.push("/vendor/withdraw")}
            >
              Withdraw your earnings
            </button>

            <button
              type="button"
              className="w-full rounded-xl border px-4 py-3 text-sm"
              onClick={async () => {
                const next = !showPayouts;
                setShowPayouts(next);
                if (next) await loadPayoutsInline();
              }}
            >
              {showPayouts ? "Hide payout history" : "Payout history"}
            </button>

            {showPayouts ? (
              payoutsLoading ? (
                <div className="text-sm text-gray-600">Loading payouts…</div>
              ) : payouts.length === 0 ? (
                <div className="text-sm text-gray-600">No payouts yet.</div>
              ) : (
                <div className="grid gap-2">
                  {payouts.map((p) => (
                    <div key={p.id} className="rounded-xl border p-3">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold">{naira(p.amount)}</p>
                        <p className="text-xs text-gray-600">{fmtDate(p.created_at)}</p>
                      </div>
                      {p.reference ? <p className="mt-1 text-xs text-gray-600">Ref: {p.reference}</p> : null}
                    </div>
                  ))}
                </div>
              )
            ) : null}
          </div>

          {/* Logistics */}
          <div className="rounded-2xl border bg-white p-4">
            <p className="font-semibold">Delivery partner</p>
            <div className="mt-3 flex items-center gap-3">
              <img src="/sprintlogo.jpg" alt="Sprint" className="h-15 w-15 rounded-xl border " />
              <div>
                <p className="text-sm font-semibold">SPRINT Logistics</p>
                <p className="text-xs text-gray-600">Official logistics partner for Dashbuy deliveries</p>
              </div>
            </div>
          </div>

          {/* Security */}
          <div className="rounded-2xl border bg-white p-4 space-y-2">
            <p className="font-semibold">Security</p>

            <button type="button" className="w-full rounded-xl border px-4 py-3 text-sm" onClick={onResetPassword}>
              Reset password
            </button>

            <button type="button" className="w-full rounded-xl border px-4 py-3 text-sm" onClick={onLogout}>
              Log out
            </button>

            <button
              type="button"
              className="w-full rounded-xl border px-4 py-3 text-sm text-red-600"
              onClick={onDeleteRequest}
            >
              Request account deletion
            </button>
          </div>

          {/* Support */}
          <div className="rounded-2xl border bg-white p-4 space-y-2">
            <p className="font-semibold">Support</p>

            <a
              className="block w-full rounded-xl border px-4 py-3 text-center text-sm"
              href="https://wa.me/2347057602937"
              target="_blank"
              rel="noreferrer"
            >
              Contact support on WhatsApp
            </a>

            <button
              type="button"
              className="w-full rounded-xl border px-4 py-3 text-sm"
              onClick={() => router.push("/terms/vendor")}
            >
              Vendor Terms and Conditions
            </button>

            <button
              type="button"
              className="w-full rounded-xl border px-4 py-3 text-sm"
              onClick={() => router.push("/vendor/about")}
            >
              About Dashbuy
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}
