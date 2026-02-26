"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import AppShell from "@/components/AppShell";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

export default function InstallPage() {
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
      setHint("Dashbuy installed successfully.");
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function handleInstallNow() {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      setHint(choice.outcome === "accepted" ? "Installing Dashbuy..." : "Install was dismissed.");
      return;
    }
    if (isIos) {
      setHint("On iPhone: tap Share, then Add to Home Screen.");
      return;
    }
    setHint("Install option is in your browser menu if prompt is not showing.");
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
            <p>2. Tap the browser menu (top-right).</p>
            <p>3. Tap Install app or Add to Home screen.</p>
            <p>4. Confirm by tapping Install.</p>
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

