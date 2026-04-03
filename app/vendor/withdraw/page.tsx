"use client";

import { useRouter } from "next/navigation";

export default function VendorWithdrawPage() {
  const router = useRouter();

  return (
    <main className="p-4 max-w-3xl mx-auto space-y-4">
      <div className="rounded-2xl border bg-white p-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-gray-600">Vendor withdrawal</p>
          <p className="text-base font-semibold">Automatic withdrawal</p>
        </div>
        <button
          type="button"
          className="rounded-xl border px-3 py-2 text-sm"
          onClick={() => router.push("/vendor/account")}
        >
          Back
        </button>
      </div>

      <div className="relative">
        <div className="pointer-events-none select-none blur-sm space-y-4">
          <div className="rounded-2xl border bg-white p-4 grid grid-cols-3 gap-2">
            <div className="rounded-xl border p-3">
              <p className="text-xs text-gray-600">Total earned</p>
              <p className="mt-1 text-lg font-semibold">N0</p>
            </div>
            <div className="rounded-xl border p-3">
              <p className="text-xs text-gray-600">Already paid</p>
              <p className="mt-1 text-lg font-semibold">N0</p>
            </div>
            <div className="rounded-xl border p-3">
              <p className="text-xs text-gray-600">Withdrawable</p>
              <p className="mt-1 text-lg font-semibold">N0</p>
            </div>
          </div>

          <div className="rounded-2xl border bg-white p-4 space-y-3">
            <p className="font-semibold">Bank details and amount</p>
            <input className="w-full rounded-xl border px-3 py-3" placeholder="Bank" disabled />
            <input className="w-full rounded-xl border px-3 py-3" placeholder="Account number" disabled />
            <input className="w-full rounded-xl border px-3 py-3" placeholder="Account name" disabled />
            <input className="w-full rounded-xl border px-3 py-3" placeholder="Amount" disabled />
            <button type="button" className="w-full rounded-xl border px-4 py-3 text-sm" disabled>
              Withdraw now
            </button>
          </div>
        </div>

        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
          <span className="rounded-full border bg-black px-5 py-2 text-sm font-semibold text-white">
            Feature coming soon
          </span>
        </div>
      </div>
    </main>
  );
}

