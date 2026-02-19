"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function LegacyComboCartRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/food/cart");
  }, [router]);

  return <main className="p-6">Redirecting to food cart...</main>;
}
