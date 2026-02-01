"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { supabase } from "@/lib/supabaseClient";

export default function FoodVendorSignupPage() {
  const router = useRouter();

  const [storeName, setStoreName] = useState("");
  const [storePhone, setStorePhone] = useState("");
  const [storeAddress, setStoreAddress] = useState("");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const canSubmit = useMemo(() => {
    return (
      storeName.trim().length >= 2 &&
      storePhone.trim().length >= 6 &&
      storeAddress.trim().length >= 4 &&
      email.trim().length > 3 &&
      password.trim().length >= 6 &&
      !loading
    );
  }, [storeName, storePhone, storeAddress, email, password, loading]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setLoading(true);

    const emailRedirectTo = `${window.location.origin}/auth/login?verified=1`;

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
      setMsg(error.message);
      return;
    }

    const userId = data.user?.id;
    if (!userId) {
      setLoading(false);
      setMsg("Signup succeeded but user id was not returned. Try signing in after verify.");
      return;
    }

    const { error: upsertErr } = await supabase.from("profiles").upsert(
      {
        id: userId,
        role: "vendor_food",
        full_name: storeName.trim(),
        phone: storePhone.trim(),
        default_address: storeAddress.trim(),
      },
      { onConflict: "id" }
    );

    setLoading(false);

    if (upsertErr) {
      setMsg(`Created auth user but could not save vendor profile: ${upsertErr.message}`);
      return;
    }

    setMsg("Vendor account created. Verify your email, then sign in.");
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
                onChange={(e) => setStoreName(e.target.value)}
                placeholder="Your restaurant name"
              />
            </div>

            <div>
              <label className="text-sm text-gray-700">Phone number</label>
              <input
                className="mt-1 w-full rounded-xl border px-3 py-3 outline-none"
                value={storePhone}
                onChange={(e) => setStorePhone(e.target.value)}
                placeholder="080..."
              />
            </div>

            <div>
              <label className="text-sm text-gray-700">Store address</label>
              <input
                className="mt-1 w-full rounded-xl border px-3 py-3 outline-none"
                value={storeAddress}
                onChange={(e) => setStoreAddress(e.target.value)}
                placeholder="Ago location"
              />
            </div>

            <div>
              <label className="text-sm text-gray-700">Email</label>
              <input
                className="mt-1 w-full rounded-xl border px-3 py-3 outline-none"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@gmail.com"
                type="email"
              />
            </div>

            <div>
              <label className="text-sm text-gray-700">Password</label>
              <div className="mt-1 flex items-center gap-2">
                <input
                  className="w-full rounded-xl border px-3 py-3 outline-none"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
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
            </div>

            <button
              disabled={!canSubmit}
              className="w-full rounded-xl bg-black px-4 py-3 text-white disabled:opacity-50"
              type="submit"
            >
              {loading ? "Creating..." : "Create vendor account"}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
