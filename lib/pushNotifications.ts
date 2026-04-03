import webpush from "web-push";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  icon?: string;
  badge?: string;
};

type PushRow = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

function appBaseUrl() {
  return (
    process.env.APP_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    ""
  ).replace(/\/+$/, "");
}

function configured() {
  return Boolean(
    process.env.PUSH_VAPID_PUBLIC_KEY &&
      process.env.PUSH_VAPID_PRIVATE_KEY &&
      process.env.PUSH_VAPID_SUBJECT
  );
}

function ensureConfigured() {
  if (!configured()) return false;
  webpush.setVapidDetails(
    String(process.env.PUSH_VAPID_SUBJECT),
    String(process.env.PUSH_VAPID_PUBLIC_KEY),
    String(process.env.PUSH_VAPID_PRIVATE_KEY)
  );
  return true;
}

export function pushPublicKey() {
  const key = String(process.env.PUSH_VAPID_PUBLIC_KEY ?? "").trim();
  return key;
}

export function isPushEnabled() {
  return configured();
}

export function withPushDefaults(payload: PushPayload): PushPayload {
  const base = appBaseUrl();
  const icon = payload.icon || (base ? `${base}/icons/icon-192.png` : "/icons/icon-192.png");
  const badge = payload.badge || (base ? `${base}/icons/icon-192.png` : "/icons/icon-192.png");
  return { ...payload, icon, badge };
}

export async function sendPushToUser(userId: string, payload: PushPayload) {
  try {
    if (!ensureConfigured()) {
      return;
    }

    const { data, error } = await supabaseAdmin
      .from("push_subscriptions")
      .select("endpoint,p256dh,auth")
      .eq("user_id", userId);

    if (error || !data || data.length === 0) return;

    const subscriptions = data as PushRow[];
    const body = JSON.stringify(withPushDefaults(payload));

    for (const sub of subscriptions) {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.p256dh,
              auth: sub.auth,
            },
          },
          body
        );
      } catch (err: unknown) {
        const statusCode =
          typeof err === "object" && err !== null && "statusCode" in err
            ? Number((err as { statusCode?: number }).statusCode ?? 0)
            : 0;
        const shouldDelete = statusCode === 404 || statusCode === 410;
        if (shouldDelete) {
          await supabaseAdmin.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
        } else {
          console.warn("push send failed:", err);
        }
      }
    }
  } catch (e) {
    console.warn("sendPushToUser failed:", e);
  }
}

