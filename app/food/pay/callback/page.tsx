"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";

function PayCallbackPageInner() {
  const sp = useSearchParams();
  const router = useRouter();

  const [msg, setMsg] = useState("Verifying payment...");

  useEffect(() => {
    (async () => {
      const reference = sp.get("reference");

      if (!reference) {
        setMsg("Missing Paystack reference. Payment cannot be verified.");
        return;
      }

      try {
        const resp = await fetch("/api/paystack/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reference }),
        });

        const json = await resp.json();

        if (!resp.ok || !json?.ok) {
          setMsg(json?.error ?? "Verification failed");
          return;
        }

        setMsg("Payment verified ✅ Redirecting...");

        // Always redirect to a safe page
        router.replace("/");
      } catch (e: unknown) {
        const m = e instanceof Error ? e.message : "Network error";
        setMsg(m);
      }
    })();
  }, [sp, router]);

  return (
    <main className="min-h-screen bg-white flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border bg-white p-6">
        <p className="text-sm text-gray-600">Paystack</p>
        <p className="mt-1 text-lg">{msg}</p>
      </div>
    </main>
  );
}

export default function PayCallbackPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-white flex items-center justify-center p-6"><div className="w-full max-w-md rounded-2xl border bg-white p-6"><p className="text-sm text-gray-600">Paystack</p><p className="mt-1 text-lg">Verifying payment...</p></div></main>}>
      <PayCallbackPageInner />
    </Suspense>
  );
}
