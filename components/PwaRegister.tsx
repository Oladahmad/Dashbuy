"use client";

import { useEffect } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

declare global {
  interface Window {
    __dashbuyDeferredPrompt?: BeforeInstallPromptEvent | null;
  }
}

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

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      window.__dashbuyDeferredPrompt = event as BeforeInstallPromptEvent;
      window.dispatchEvent(new CustomEvent("dashbuy:pwa-prompt-available"));
    };

    const onInstalled = () => {
      window.__dashbuyDeferredPrompt = null;
      window.dispatchEvent(new CustomEvent("dashbuy:pwa-installed"));
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);

    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Keep silent to avoid noisy UI errors.
    });

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  return null;
}
