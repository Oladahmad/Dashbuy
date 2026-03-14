"use client";

import { useEffect } from "react";

export default function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    if (process.env.NODE_ENV !== "production") {
      navigator.serviceWorker.getRegistrations().then((regs) => {
        regs.forEach((reg) => reg.unregister());
      });
      return;
    }

    const isLocalhost =
      window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
    if (isLocalhost) return;
    if (!window.isSecureContext) return;

    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Keep silent to avoid noisy UI errors.
    });
  }, []);

  return null;
}
