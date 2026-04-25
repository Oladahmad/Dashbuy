"use client";

import { ReactNode, useMemo } from "react";
import { usePathname } from "next/navigation";
import AppShell from "@/components/AppShell";

function titleFromPath(pathname: string) {
  if (pathname === "/food") return "Food";
  if (pathname === "/food/cart") return "Food cart";
  if (pathname === "/food/checkout") return "Checkout";
  if (pathname === "/food/order-success") return "Order success";
  if (pathname === "/food/pay/callback") return "Payment";
  if (pathname.includes("/build-plate")) return "Build plate";
  if (pathname.startsWith("/food/vendors/")) return "Restaurant";
  return "Food";
}

export default function FoodLayoutClient({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const title = useMemo(() => titleFromPath(pathname), [pathname]);

  return <AppShell title={title}>{children}</AppShell>;
}
