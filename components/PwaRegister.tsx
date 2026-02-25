"use client";

import { useEffect } from "react";

export default function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const isLocalhost =
      window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
    if (!window.isSecureContext && !isLocalhost) return;

    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Keep silent to avoid noisy UI errors.
    });
  }, []);

  return null;
}
