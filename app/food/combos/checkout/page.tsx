"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function LegacyComboCheckoutRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/food/checkout");
  }, [router]);

  return <main className="p-6">Redirecting to unified checkout...</main>;
}
