"use client";

import { useEffect, useMemo, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

export default function PwaInstallCard() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [hint, setHint] = useState("");

  const isIos = useMemo(() => {
    if (typeof navigator === "undefined") return false;
    const ua = navigator.userAgent.toLowerCase();
    return /iphone|ipad|ipod/.test(ua);
  }, []);

  useEffect(() => {
    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };

    const onInstalled = () => {
      setInstalled(true);
      setDeferredPrompt(null);
      setHint("App installed successfully.");
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function handleInstall() {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === "accepted") {
        setHint("Installing Dashbuy...");
      } else {
        setHint("Install was dismissed.");
      }
      return;
    }

    if (isIos) {
      setHint("On iPhone: open browser menu, then Add to Home Screen.");
      return;
    }

    setHint("Install is available from your browser menu on this device.");
  }

  return (
    <div className="mt-5 rounded-2xl border bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-gray-500">Dashbuy App</p>
          <h3 className="mt-1 text-lg font-semibold">Install for faster checkout</h3>
          <p className="mt-1 text-sm text-gray-600">
            Open Dashbuy like a real app, with quick launch from your home screen.
          </p>
        </div>
        <div className="hidden h-10 w-10 rounded-xl border bg-black sm:block" />
      </div>

      <div className="mt-4 flex items-center gap-2">
        <button
          type="button"
          onClick={handleInstall}
          disabled={installed}
          className="rounded-xl bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {installed ? "Installed" : "Install Dashbuy"}
        </button>
        <span className="text-xs text-gray-500">PWA</span>
      </div>

      {hint ? <p className="mt-2 text-xs text-gray-600">{hint}</p> : null}
    </div>
  );
}

