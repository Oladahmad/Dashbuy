"use client";

import { ReactNode, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type Role = "customer" | "vendor_food" | "vendor_products" | "logistics" | "admin";

type Profile = {
  id: string;
  role: Role;
};

export default function LogisticsLayoutClient({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let alive = true;

    async function load() {
      const { data: u } = await supabase.auth.getUser();
      const user = u.user;

      if (!user) {
        router.replace("/auth/login");
        return;
      }

      const { data: p } = await supabase
        .from("profiles")
        .select("id,role")
        .eq("id", user.id)
        .maybeSingle<Profile>();

      const role = (p?.role ?? "customer") as Role;

      const ok = role === "logistics" || role === "admin";
      if (!ok) {
        router.replace("/");
        return;
      }

      if (alive) setChecking(false);
    }

    load();

    return () => {
      alive = false;
    };
  }, [router]);

  if (checking) {
    return (
      <main className="min-h-screen bg-white p-6">
        <div className="rounded-2xl border bg-white p-5 text-sm text-gray-600">
          Loading logistics...
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-white">
      <header className="sticky top-0 z-20 border-b bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <div className="leading-tight">
            <p className="text-sm text-gray-600">Sprint Logistics</p>
            <p className="text-base font-semibold">Logistics Dashboard</p>
          </div>
          <button
            className="rounded-lg border px-3 py-2 text-sm"
            type="button"
            onClick={async () => {
              await supabase.auth.signOut();
              router.replace("/auth/login");
            }}
          >
            Log out
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-4 py-4">{children}</div>
    </main>
  );
}
