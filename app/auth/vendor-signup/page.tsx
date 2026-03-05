"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";

export default function VendorSignupChoosePage() {
  const router = useRouter();

  return (
    <main className="min-h-screen bg-white px-4 py-10">
      <div className="mx-auto w-full max-w-md">
        <button
          onClick={() => router.push("/auth/login")}
          className="mb-6 rounded-lg border px-3 py-2 text-sm"
        >
          Back
        </button>
        <button
          onClick={() => router.push("/auth/login?mode=vendor")}
          className="mb-6 ml-2 rounded-lg border px-3 py-2 text-sm"
        >
          Sign in
        </button>

        <div className="rounded-2xl border bg-white p-6">
          <div className="mb-6 flex flex-col items-center">
            <div className="flex items-center justify-center">
          <Image src="/logo.png" alt="Dashbuy" width={64} height={64} className="h-16 w-auto" />
        </div>
            <h1 className="text-xl font-semibold">Vendor signup</h1>
            <p className="mt-1 text-sm text-gray-600">
              Choose what you want to sell on Dashbuy.
            </p>
          </div>

          <div className="grid gap-3">
            <button
              className="rounded-xl border px-4 py-4 text-left"
              onClick={() => router.push("/auth/vendor-signup/food")}
            >
              <p className="font-medium">Food vendor</p>
              <p className="mt-1 text-sm text-gray-600">
                Sell single meals and combos.
              </p>
            </button>

            <button
              className="rounded-xl border px-4 py-4 text-left"
              onClick={() => router.push("/auth/vendor-signup/products")}
            >
              <p className="font-medium">Product vendor</p>
              <p className="mt-1 text-sm text-gray-600">
                Sell products in the store.
              </p>
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
