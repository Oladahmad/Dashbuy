"use client";

import { useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";

function base64UrlToUint8Array(base64Url: string) {
  const padding = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) {
    output[i] = raw.charCodeAt(i);
  }
  return output;
}

export default function PwaPushSubscribe() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return;

    let cancelled = false;

    async function registerPush() {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;
        if (!token) return;

        const permission =
          Notification.permission === "default"
            ? await Notification.requestPermission()
            : Notification.permission;
        if (permission !== "granted") return;

        const reg = await navigator.serviceWorker.ready;
        const keyResp = await fetch("/api/push/public-key", { method: "GET" });
        const keyBody = (await keyResp.json().catch(() => null)) as { ok?: boolean; publicKey?: string } | null;
        if (!keyResp.ok || !keyBody?.ok || !keyBody.publicKey) return;

        let sub = await reg.pushManager.getSubscription();
        if (!sub) {
          sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: base64UrlToUint8Array(keyBody.publicKey),
          });
        }
        if (!sub || cancelled) return;

        await fetch("/api/push/subscribe", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(sub.toJSON()),
        });
      } catch {
        // Keep silent to avoid noisy UX.
      }
    }

    registerPush();
    const { data: authSub } = supabase.auth.onAuthStateChange(() => {
      registerPush();
    });

    return () => {
      cancelled = true;
      authSub.subscription.unsubscribe();
    };
  }, []);

  return null;
}

