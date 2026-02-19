"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { formatAuthError } from "@/lib/authError";

type VendorRole = "vendor_food" | "vendor_products";

export default function VendorSignupPage() {
  const router = useRouter();

  const [role, setRole] = useState<VendorRole>("vendor_products");
  const [storeName, setStoreName] = useState("");
  const [storePhone, setStorePhone] = useState("");
  const [storeAddress, setStoreAddress] = useState("");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  async function signupVendor() {
    setMsg("");
    setLoading(true);

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          role,
          store_name: storeName.trim(),
          store_phone: storePhone.trim(),
          store_address: storeAddress.trim(),
        },
      },
    });

    if (error) {
      setMsg(formatAuthError(error.message));
      setLoading(false);
      return;
    }

    const session = data.session;

    if (!session) {
      const userId = data.user?.id;
      if (userId) {
        await fetch("/api/auth/ensure-profile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId,
            role,
            vendorCategory: role === "vendor_food" ? "food" : "products",
            fullName: storeName.trim(),
            phone: storePhone.trim(),
            address: storeAddress.trim(),
            storeName: storeName.trim(),
            storeAddress: storeAddress.trim(),
          }),
        });
      }
      setMsg("Vendor account created. Please verify your email, then sign in as vendor.");
      setLoading(false);
      return;
    }

    const userId = data.user?.id;
    if (userId) {
      await fetch("/api/auth/ensure-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          role,
          vendorCategory: role === "vendor_food" ? "food" : "products",
          fullName: storeName.trim(),
          phone: storePhone.trim(),
          address: storeAddress.trim(),
          storeName: storeName.trim(),
          storeAddress: storeAddress.trim(),
        }),
      });
    }

    router.push("/vendor");
    setLoading(false);
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl bg-white border p-6">
        <div className="flex flex-col items-center">
          <Image src="/logo.png" alt="Dashbuy" width={72} height={72} />
          <p className="mt-2 text-xl font-semibold">Vendor signup</p>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            className={`rounded-xl border py-2 ${role === "vendor_products" ? "bg-black text-white border-black" : "bg-white"}`}
            onClick={() => setRole("vendor_products")}
          >
            Product vendor
          </button>
          <button
            type="button"
            className={`rounded-xl border py-2 ${role === "vendor_food" ? "bg-black text-white border-black" : "bg-white"}`}
            onClick={() => setRole("vendor_food")}
          >
            Food vendor
          </button>
        </div>

        <div className="mt-4 grid gap-3">
          <input
            className="rounded-xl border p-3"
            placeholder="Store name"
            value={storeName}
            onChange={(e) => setStoreName(e.target.value)}
          />

          <input
            className="rounded-xl border p-3"
            placeholder="Store phone"
            value={storePhone}
            onChange={(e) => setStorePhone(e.target.value)}
          />

          <textarea
            className="rounded-xl border p-3"
            placeholder="Store address"
            rows={3}
            value={storeAddress}
            onChange={(e) => setStoreAddress(e.target.value)}
          />

          <input
            className="rounded-xl border p-3"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <input
            className="rounded-xl border p-3"
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          {msg ? <p className="text-sm text-red-600">{msg}</p> : null}

          <button
            type="button"
            className="rounded-xl bg-black text-white py-3"
            onClick={signupVendor}
            disabled={loading}
          >
            {loading ? "Creating..." : "Create vendor account"}
          </button>
        </div>

        <div className="mt-5 text-sm text-center text-gray-600">
          Already have a vendor account?{" "}
          <a className="underline" href="/auth/login">
            Sign in
          </a>
        </div>
      </div>
    </div>
  );
}
