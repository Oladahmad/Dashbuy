"use client";

import { useEffect } from "react";

export default function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const isProd = process.env.NODE_ENV === "production";
    if (!isProd) return;

    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Keep silent to avoid noisy UI errors.
    });
  }, []);

  return null;
}

