"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import AppShell from "@/components/AppShell";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

export default function InstallPage() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(() =>
    typeof window === "undefined" ? null : window.__dashbuyDeferredPrompt ?? null
  );
  const [installed, setInstalled] = useState(() =>
    typeof window === "undefined" ? false : window.matchMedia("(display-mode: standalone)").matches
  );
  const [hint, setHint] = useState(() =>
    typeof window !== "undefined" && window.matchMedia("(display-mode: standalone)").matches
      ? "Dashbuy is already installed on this phone."
      : ""
  );

  const isStandalone = useMemo(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(display-mode: standalone)").matches;
  }, []);

  const isIos = useMemo(() => {
    if (typeof navigator === "undefined") return false;
    const ua = navigator.userAgent.toLowerCase();
    return /iphone|ipad|ipod/.test(ua);
  }, []);

  const isAndroid = useMemo(() => {
    if (typeof navigator === "undefined") return false;
    return /android/i.test(navigator.userAgent);
  }, []);

  const isChromeLike = useMemo(() => {
    if (typeof navigator === "undefined") return false;
    const ua = navigator.userAgent;
    return /Chrome|CriOS/i.test(ua) && !/EdgA|OPR|SamsungBrowser/i.test(ua);
  }, []);

  useEffect(() => {
    const onPromptAvailable = () => {
      setDeferredPrompt(window.__dashbuyDeferredPrompt ?? null);
    };

    const onInstalled = () => {
      setInstalled(true);
      setDeferredPrompt(null);
      window.__dashbuyDeferredPrompt = null;
      setHint("Dashbuy installed successfully.");
    };

    window.addEventListener("dashbuy:pwa-prompt-available", onPromptAvailable);
    window.addEventListener("dashbuy:pwa-installed", onInstalled);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("dashbuy:pwa-prompt-available", onPromptAvailable);
      window.removeEventListener("dashbuy:pwa-installed", onInstalled);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, [isStandalone]);

  async function handleInstallNow() {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      window.__dashbuyDeferredPrompt = null;
      setDeferredPrompt(null);
      setHint(choice.outcome === "accepted" ? "Installing Dashbuy..." : "Install was dismissed.");
      return;
    }
    if (isIos) {
      setHint("On iPhone: tap Share, then Add to Home Screen.");
      return;
    }
    if (isAndroid && !isChromeLike) {
      setHint("Open Dashbuy in Chrome on Android, then try Install app or Add to Home screen from the browser menu.");
      return;
    }
    if (isAndroid) {
      setHint("If Install app is missing, update Chrome, browse Dashbuy for a short while, then open the 3-dot menu and look for Add to Home screen.");
      return;
    }
    setHint("Use a supported secure browser. On Android, Chrome works best. On iPhone, use Safari.");
  }

  return (
    <AppShell title="Install Dashbuy">
      <div className="overflow-hidden rounded-2xl border bg-white">
        <div className="bg-black px-5 py-5 text-white">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 overflow-hidden rounded-xl border border-white/20 bg-white">
              <Image src="/logo.png" alt="Dashbuy" width={48} height={48} className="h-12 w-12 object-cover" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-white/70">Dashbuy Mobile App</p>
              <h1 className="text-xl font-semibold">Install in 1 minute</h1>
            </div>
          </div>
          <p className="mt-3 text-sm text-white/80">
            Follow the steps below based on your phone. After install, Dashbuy opens from your home screen.
          </p>
        </div>

        <div className="p-5">
          <button
            type="button"
            onClick={handleInstallNow}
            disabled={installed}
            className="w-full rounded-xl bg-black px-4 py-3 text-sm font-medium text-white disabled:opacity-50"
          >
            {installed ? "Installed" : "Install Dashbuy now"}
          </button>
          {hint ? <p className="mt-2 text-sm text-gray-600">{hint}</p> : null}
        </div>
      </div>

      <div className="mt-5 grid gap-4">
        <section className="rounded-2xl border bg-white p-5">
          <h2 className="text-base font-semibold">Android (Chrome)</h2>
          <div className="mt-3 grid gap-2 text-sm text-gray-700">
            <p>1. Open Dashbuy in Chrome browser.</p>
            <p>2. Stay on the site for a few seconds and browse one or two pages.</p>
            <p>3. Tap the browser menu (top-right).</p>
            <p>4. Tap Install app or Add to Home screen.</p>
            <p>5. If nothing shows, update Chrome or try removing Lite mode/Data saver on older phones.</p>
          </div>
        </section>

        <section className="rounded-2xl border bg-white p-5">
          <h2 className="text-base font-semibold">If Android still does not show install</h2>
          <div className="mt-3 grid gap-2 text-sm text-gray-700">
            <p>1. Make sure the site opens with `https://` and not inside Facebook, Instagram, or another in-app browser.</p>
            <p>2. Open the link directly in Chrome, not Opera Mini, UC Browser, or a social media browser tab.</p>
            <p>3. Update Chrome from Play Store if the phone supports updates.</p>
            <p>4. If the phone is very old, use Add to Home screen as fallback even when the full app-style install prompt does not appear.</p>
          </div>
        </section>

        <section className="rounded-2xl border bg-white p-5">
          <h2 className="text-base font-semibold">iPhone (Safari)</h2>
          <div className="mt-3 grid gap-2 text-sm text-gray-700">
            <p>1. Open Dashbuy in Safari (not Chrome).</p>
            <p>2. Tap the Share button.</p>
            <p>3. Scroll and tap Add to Home Screen.</p>
            <p>4. Tap Add to finish.</p>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
