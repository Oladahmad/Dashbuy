"use client";

import { ReactNode, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import Image from "next/image";

type Role = "customer" | "vendor_food" | "vendor_products" | "logistics" | "admin";

export default function AdminLayoutClient({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user) {
        router.replace("/auth/login?mode=vendor&next=%2Fadmin");
        return;
      }

      const { data: profile, error } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle<{ role: Role }>();

      if (!alive) return;
      if (error) {
        setMsg(error.message);
        setLoading(false);
        return;
      }

      if ((profile?.role ?? "customer") !== "admin") {
        router.replace("/");
        return;
      }

      setLoading(false);
    })();

    return () => {
      alive = false;
    };
  }, [router]);

  async function onLogout() {
    await supabase.auth.signOut();
    router.replace("/auth/login");
  }

  const title = pathname === "/admin" ? "Admin" : "Admin";

  return (
    <main className="mx-auto max-w-5xl p-4 sm:p-6">
      <div className="rounded-2xl border bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Image src="/logo.png" alt="Dashbuy" width={32} height={32} className="h-8 w-8 rounded" />
            <h1 className="text-lg font-semibold">{title}</h1>
          </div>
          <button type="button" className="rounded-xl border px-4 py-2 text-sm" onClick={onLogout}>
            Log out
          </button>
        </div>
      </div>

      {loading ? <div className="mt-4 rounded-2xl border bg-white p-4 text-sm text-gray-600">Loading admin...</div> : null}
      {!loading && msg ? <div className="mt-4 rounded-2xl border bg-white p-4 text-sm text-red-600">{msg}</div> : null}
      {!loading && !msg ? <div className="mt-4">{children}</div> : null}
    </main>
  );
}
