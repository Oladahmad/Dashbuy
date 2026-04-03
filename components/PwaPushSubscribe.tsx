"use client";

import { useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { ensurePushSubscribed, isPushSupported } from "@/lib/pushClient";

export default function PwaPushSubscribe() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!isPushSupported()) return;

    let cancelled = false;

    async function registerPush() {
      try {
        if (cancelled) return;
        await ensurePushSubscribed({ askPermission: false });
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
