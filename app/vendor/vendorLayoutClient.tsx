"use client";

import { ReactNode, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import VendorShell from "@/components/VendorShell";
import { supabase } from "@/lib/supabaseClient";

type Role = "customer" | "vendor_food" | "vendor_products" | "admin";

type Profile = {
  id: string;
  role: Role;
  store_name: string | null;
};

function buildNav(role: Role) {
  if (role === "vendor_food") {
    return [
      { href: "/vendor", label: "Home" },
      { href: "/vendor/food", label: "Food" },
      { href: "/vendor/orders", label: "Orders" },
      { href: "/vendor/account", label: "Account" },
    ];
  }

  if (role === "vendor_products") {
    return [
      { href: "/vendor", label: "Home" },
      { href: "/vendor/products", label: "Products" },
      { href: "/vendor/orders", label: "Orders" },
      { href: "/vendor/account", label: "Account" },
    ];
  }

  return [
    { href: "/vendor", label: "Home" },
    { href: "/vendor/orders", label: "Orders" },
    { href: "/vendor/account", label: "Account" },
    { href: "/vendor/about", label: "About" },
  ];
}

export default function VendorLayoutClient({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  const [role, setRole] = useState<Role>("customer");
  const [storeName, setStoreName] = useState<string>("Vendor");

  useEffect(() => {
    let alive = true;

    async function load() {
      const { data: u } = await supabase.auth.getUser();
      const user = u.user;

      if (!user) {
        router.replace("/auth/login?mode=vendor");
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("id, role, store_name")
        .eq("id", user.id)
        .maybeSingle<Profile>();

      const r = (profile?.role ?? "customer") as Role;

      if (!alive) return;

      setRole(r);
      setStoreName(profile?.store_name?.trim() ? profile.store_name : "Vendor");

      if (r === "admin") {
        router.replace("/admin/custom-food-requests");
        return;
      }

      const isVendor = r === "vendor_food" || r === "vendor_products";
      if (!isVendor) {
        router.replace("/");
        return;
      }
    }

    load();

    return () => {
      alive = false;
    };
  }, [router]);

  const navItems = useMemo(() => buildNav(role), [role]);

  const title = useMemo(() => {
    if (pathname === "/vendor") return "Vendor Dashboard";
    if (pathname.startsWith("/vendor/food")) return "Food";
    if (pathname.startsWith("/vendor/products")) return "Products";
    if (pathname.startsWith("/vendor/orders")) return "Orders";
    if (pathname.startsWith("/vendor/account")) return "Account";
    return "Vendor";
  }, [pathname]);

  return (
    <VendorShell title={title} subtitle={storeName} navItems={navItems}>
      {children}
    </VendorShell>
  );
}
