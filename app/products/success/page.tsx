"use client";

import AppShell from "@/components/AppShell";
import { useRouter } from "next/navigation";

export default function ProductsSuccessPage() {
  const router = useRouter();

  return (
    <AppShell title="Success">
      <div className="rounded-2xl border bg-white p-5">
        <p className="text-lg font-semibold">Order placed ✅</p>
        <p className="mt-1 text-sm text-gray-600">
          Your products order was successful.
        </p>

        <button
          className="mt-4 w-full rounded-xl bg-black px-4 py-3 text-white"
          onClick={() => router.push("/")}
          type="button"
        >
          Back to Home →
        </button>
      </div>
    </AppShell>
  );
}
