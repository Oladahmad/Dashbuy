"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { supabase } from "@/lib/supabaseClient";

export default function VendorSignupPage() {
  const router = useRouter();

  const [vendorType, setVendorType] = useState<"food" | "products">("food");

  const [storeName, setStoreName] = useState("");
  const [storeAddress, setStoreAddress] = useState("");

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function onSignup() {
    setLoading(true);
    setMsg(null);

    const role = vendorType === "food" ? "vendor_food" : "vendor_products";

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          role,
          vendor_category: vendorType,
          store_name: storeName,
          store_address: storeAddress,
          full_name: fullName,
          phone,
        },
      },
    });

    setLoading(false);

    if (error) {
      setMsg(error.message);
      return;
    }

    setMsg("Vendor account created. Verify email, then sign in as vendor.");
  }

  return (
    <main className="min-h-screen bg-white flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border bg-white p-6">
        <div className="flex items-center justify-center">
          <Image src="/logo.jpg" alt="Dashbuy" width={64} height={64} className="h-16 w-auto" />
        </div>

        <h1 className="mt-4 text-center text-2xl font-bold">Create vendor account</h1>
        <p className="mt-1 text-center text-sm text-gray-600">
          Choose what you want to sell.
        </p>

        <div className="mt-5 space-y-3">
          <div className="grid grid-cols-2 gap-2 rounded-xl border p-1">
            <button
              className={`rounded-lg px-3 py-2 text-sm ${vendorType === "food" ? "bg-black text-white" : "bg-white"}`}
              onClick={() => setVendorType("food")}
              type="button"
            >
              Food vendor
            </button>
            <button
              className={`rounded-lg px-3 py-2 text-sm ${vendorType === "products" ? "bg-black text-white" : "bg-white"}`}
              onClick={() => setVendorType("products")}
              type="button"
            >
              Product vendor
            </button>
          </div>

          <div>
            <label className="text-sm font-medium">Store name</label>
            <input className="mt-1 w-full rounded-xl border px-3 py-2" value={storeName} onChange={(e) => setStoreName(e.target.value)} />
          </div>

          <div>
            <label className="text-sm font-medium">Store address</label>
            <input className="mt-1 w-full rounded-xl border px-3 py-2" value={storeAddress} onChange={(e) => setStoreAddress(e.target.value)} />
          </div>

          <div>
            <label className="text-sm font-medium">Owner full name</label>
            <input className="mt-1 w-full rounded-xl border px-3 py-2" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>

          <div>
            <label className="text-sm font-medium">Phone</label>
            <input className="mt-1 w-full rounded-xl border px-3 py-2" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>

          <div>
            <label className="text-sm font-medium">Email</label>
            <input className="mt-1 w-full rounded-xl border px-3 py-2" value={email} onChange={(e) => setEmail(e.target.value)} type="email" />
          </div>

          <div>
            <label className="text-sm font-medium">Password</label>
            <input className="mt-1 w-full rounded-xl border px-3 py-2" value={password} onChange={(e) => setPassword(e.target.value)} type="password" />
          </div>

          {msg ? <p className={`text-sm ${msg.includes("Verify") ? "text-green-700" : "text-red-600"}`}>{msg}</p> : null}

          <button
            className="w-full rounded-xl bg-black px-4 py-3 text-white disabled:opacity-60"
            onClick={onSignup}
            disabled={loading || !storeName || !storeAddress || !fullName || !phone || !email || !password}
          >
            {loading ? "Creating..." : "Create vendor account"}
          </button>

          <div className="flex items-center justify-between text-sm">
            <button className="underline" type="button" onClick={() => router.push("/")}>
              Back
            </button>
            <a className="underline" href="/auth/login?mode=vendor">
              Sign in as vendor
            </a>
          </div>
        </div>
      </div>
    </main>
  );
}
