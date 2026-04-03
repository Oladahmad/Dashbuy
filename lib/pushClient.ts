"use client";

import { supabase } from "@/lib/supabaseClient";

function base64UrlToUint8Array(base64Url: string) {
  const padding = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

export function isPushSupported() {
  return typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window;
}

export async function ensurePushSubscribed(options?: { askPermission?: boolean }) {
  const askPermission = Boolean(options?.askPermission);
  if (!isPushSupported()) return { ok: false as const, error: "Push not supported on this device/browser." };

  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) return { ok: false as const, error: "Please sign in first." };

  const permission =
    Notification.permission === "default" && askPermission
      ? await Notification.requestPermission()
      : Notification.permission;

  if (permission !== "granted") {
    return {
      ok: false as const,
      error: permission === "denied" ? "Notifications are blocked in browser settings." : "Notification permission not granted yet.",
    };
  }

  const reg = await navigator.serviceWorker.ready;
  const keyResp = await fetch("/api/push/public-key", { method: "GET" });
  const keyBody = (await keyResp.json().catch(() => null)) as { ok?: boolean; publicKey?: string; error?: string } | null;
  if (!keyResp.ok || !keyBody?.ok || !keyBody.publicKey) {
    return { ok: false as const, error: keyBody?.error ?? "Push key not available from server." };
  }

  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlToUint8Array(keyBody.publicKey),
    });
  }

  const saveResp = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(sub.toJSON()),
  });
  const saveBody = (await saveResp.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
  if (!saveResp.ok || !saveBody?.ok) {
    return { ok: false as const, error: saveBody?.error ?? "Could not save push subscription." };
  }

  return { ok: true as const };
}

