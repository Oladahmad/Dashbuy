"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

export default function PwaInstallCard() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(() =>
    typeof window === "undefined" ? null : (window.__dashbuyDeferredPrompt ?? null)
  );
  const [installed, setInstalled] = useState(() =>
    typeof window === "undefined" ? false : window.matchMedia?.("(display-mode: standalone)")?.matches === true
  );
  const [hint, setHint] = useState("");

  const isIos = useMemo(() => {
    if (typeof navigator === "undefined") return false;
    return /iphone|ipad|ipod/i.test(navigator.userAgent);
  }, []);

  const isAndroid = useMemo(() => {
    if (typeof navigator === "undefined") return false;
    return /android/i.test(navigator.userAgent);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const onPromptAvailable = () => {
      setDeferredPrompt(window.__dashbuyDeferredPrompt ?? null);
    };

    const onInstalled = () => {
      setInstalled(true);
      setDeferredPrompt(null);
      window.__dashbuyDeferredPrompt = null;
      setHint("Installed.");
    };

    window.addEventListener("dashbuy:pwa-prompt-available", onPromptAvailable);
    window.addEventListener("dashbuy:pwa-installed", onInstalled);
    window.addEventListener("appinstalled", onInstalled);

    return () => {
      window.removeEventListener("dashbuy:pwa-prompt-available", onPromptAvailable);
      window.removeEventListener("dashbuy:pwa-installed", onInstalled);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function handleInstall() {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      window.__dashbuyDeferredPrompt = null;
      setDeferredPrompt(null);
      setHint(choice.outcome === "accepted" ? "Installing..." : "");
      return;
    }

    if (isIos) {
      setHint("Tap Share, then Add to Home Screen.");
      return;
    }

    if (isAndroid) {
      setHint("Open browser menu, then tap Add to Home screen.");
      return;
    }

    setHint("Open this site in your phone browser to install.");
  }

  return (
    <div className="mt-5 overflow-hidden rounded-2xl border bg-white">
      <div className="relative border-b bg-black px-5 py-4 text-white">
        <div className="absolute -right-6 -top-6 h-20 w-20 rounded-full border border-white/20" />
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 overflow-hidden rounded-xl border border-white/20 bg-white">
            <Image src="/logo.png" alt="Dashbuy" width={40} height={40} className="h-10 w-10 object-cover" />
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-white/70">Install Dashbuy</p>
            <h3 className="text-base font-semibold">Use Dashbuy like a real app</h3>
          </div>
        </div>
      </div>

      <div className="p-5">
        <p className="text-sm text-gray-700">
          Install Dashbuy on your phone for faster access.
        </p>

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => void handleInstall()}
            disabled={installed}
            className="inline-flex items-center justify-center rounded-xl bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {installed ? "Installed" : "Install now"}
          </button>
        </div>
        {hint ? <p className="mt-3 text-sm text-gray-600">{hint}</p> : null}
      </div>
    </div>
  );
}
