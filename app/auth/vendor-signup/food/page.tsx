"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { supabase } from "@/lib/supabaseClient";
import { formatAuthError, formatProfileSaveError } from "@/lib/authError";

type VendorSignupFieldErrors = {
  storeName?: string;
  storePhone?: string;
  storeAddress?: string;
  email?: string;
  password?: string;
};

export default function FoodVendorSignupPage() {
  const router = useRouter();

  const [storeName, setStoreName] = useState("");
  const [storePhone, setStorePhone] = useState("");
  const [storeAddress, setStoreAddress] = useState("");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [acceptTerms, setAcceptTerms] = useState(false);

  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<VendorSignupFieldErrors>({});

  const canSubmit = useMemo(() => {
    return (
      storeName.trim().length >= 2 &&
      storePhone.trim().length >= 6 &&
      storeAddress.trim().length >= 4 &&
      email.trim().length > 3 &&
      password.trim().length >= 6 &&
      acceptTerms &&
      !loading
    );
  }, [storeName, storePhone, storeAddress, email, password, acceptTerms, loading]);

  function validateForm() {
    const errors: VendorSignupFieldErrors = {};
    if (!storeName.trim()) errors.storeName = "Store name is required.";
    else if (storeName.trim().length < 2) errors.storeName = "Store name must be at least 2 characters.";
    if (!storePhone.trim()) errors.storePhone = "Phone number is required.";
    else if (storePhone.trim().length < 6) errors.storePhone = "Enter a valid phone number.";
    if (!storeAddress.trim()) errors.storeAddress = "Store address is required.";
    else if (storeAddress.trim().length < 4) errors.storeAddress = "Store address is too short.";
    if (!email.trim()) errors.email = "Email address is required.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errors.email = "Enter a valid email address.";
    if (!password.trim()) errors.password = "Password is required.";
    else if (password.trim().length < 6) errors.password = "Password must be at least 6 characters.";
    return errors;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errors = validateForm();
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      setMsg(null);
      return;
    }
    setMsg(null);
    setLoading(true);
    setFieldErrors({});

    const emailRedirectTo = `${window.location.origin}/auth/callback`;

    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password: password.trim(),
      options: {
        emailRedirectTo,
        data: {
          role: "vendor_food",
        },
      },
    });

    if (error) {
      setLoading(false);
      setMsg(formatAuthError(error.message));
      return;
    }

    const userId = data.user?.id;
    if (!userId) {
      setLoading(false);
      setMsg("Signup succeeded but user id was not returned. Try signing in after verify.");
      return;
    }

    const res = await fetch("/api/auth/ensure-profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId,
        role: "vendor_food",
        vendorCategory: "food",
        fullName: storeName.trim(),
        phone: storePhone.trim(),
        address: storeAddress.trim(),
        storeName: storeName.trim(),
        storeAddress: storeAddress.trim(),
      }),
    });

    const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;

    setLoading(false);

    if (!res.ok || !json?.ok) {
      setMsg(formatProfileSaveError(json?.error));
      return;
    }

    setMsg("Vendor account created. Check your inbox or spam for verification email, then sign in.");
  }

  return (
    <main className="min-h-screen bg-white px-4 py-10">
      <div className="mx-auto w-full max-w-md">
        <button
          onClick={() => router.push("/auth/vendor-signup")}
          className="mb-6 rounded-lg border px-3 py-2 text-sm"
        >
          Back
        </button>

        <div className="rounded-2xl border bg-white p-6">
          <div className="mb-6 flex flex-col items-center">
            <div className="flex items-center justify-center">
                <Image src="/logo.png" alt="Dashbuy" width={64} height={64} className="h-16 w-auto" />
            </div>
            <h1 className="text-xl font-semibold">Food vendor signup</h1>
            <p className="mt-1 text-sm text-gray-600">
              Add your store details, then verify email.
            </p>
          </div>

          {msg ? (
            <div className="mb-4 rounded-xl border bg-white px-4 py-3 text-sm">
              {msg}
            </div>
          ) : null}

          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label className="text-sm text-gray-700">Store name</label>
              <input
                className="mt-1 w-full rounded-xl border px-3 py-3 outline-none"
                value={storeName}
                onChange={(e) => {
                  setStoreName(e.target.value);
                  setFieldErrors((current) => ({ ...current, storeName: undefined }));
                }}
                placeholder="Your restaurant name"
              />
              {fieldErrors.storeName ? <p className="mt-1 text-xs text-red-600">{fieldErrors.storeName}</p> : null}
            </div>

            <div>
              <label className="text-sm text-gray-700">Phone number</label>
              <input
                className="mt-1 w-full rounded-xl border px-3 py-3 outline-none"
                value={storePhone}
                onChange={(e) => {
                  setStorePhone(e.target.value);
                  setFieldErrors((current) => ({ ...current, storePhone: undefined }));
                }}
                placeholder="080..."
              />
              {fieldErrors.storePhone ? <p className="mt-1 text-xs text-red-600">{fieldErrors.storePhone}</p> : null}
            </div>

            <div>
              <label className="text-sm text-gray-700">Store address</label>
              <input
                className="mt-1 w-full rounded-xl border px-3 py-3 outline-none"
                value={storeAddress}
                onChange={(e) => {
                  setStoreAddress(e.target.value);
                  setFieldErrors((current) => ({ ...current, storeAddress: undefined }));
                }}
                placeholder="Ago location"
              />
              {fieldErrors.storeAddress ? <p className="mt-1 text-xs text-red-600">{fieldErrors.storeAddress}</p> : null}
            </div>

            <div>
              <label className="text-sm text-gray-700">Email</label>
              <input
                className="mt-1 w-full rounded-xl border px-3 py-3 outline-none"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setFieldErrors((current) => ({ ...current, email: undefined }));
                }}
                placeholder="you@gmail.com"
                type="email"
              />
              {fieldErrors.email ? <p className="mt-1 text-xs text-red-600">{fieldErrors.email}</p> : null}
            </div>

            <div>
              <label className="text-sm text-gray-700">Password</label>
              <div className="mt-1 flex items-center gap-2">
                <input
                  className="w-full rounded-xl border px-3 py-3 outline-none"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setFieldErrors((current) => ({ ...current, password: undefined }));
                  }}
                  placeholder="Create password"
                  type={showPass ? "text" : "password"}
                />
                <button
                  type="button"
                  className="rounded-xl border px-3 py-3 text-sm"
                  onClick={() => setShowPass((v) => !v)}
                >
                  {showPass ? "Hide" : "Show"}
                </button>
              </div>
              {fieldErrors.password ? <p className="mt-1 text-xs text-red-600">{fieldErrors.password}</p> : null}
            </div>

            <label className="flex items-start gap-2 text-xs text-gray-700">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 rounded border"
                checked={acceptTerms}
                onChange={(e) => setAcceptTerms(e.target.checked)}
              />
              <span className="font-semibold">
                I agree to Dashbuy{" "}
                <a className="underline" href="/terms/vendor">
                  Vendor Terms and Conditions
                </a>
                .
              </span>
            </label>

            <button
              disabled={!canSubmit}
              className="w-full rounded-xl bg-black px-4 py-3 text-white disabled:opacity-50"
              type="submit"
            >
              {loading ? "Creating..." : "Create vendor account"}
            </button>

            <button
              type="button"
              className="w-full rounded-xl border px-4 py-3 text-sm"
              onClick={() => router.push("/auth/login?mode=vendor")}
            >
              Sign in
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
