import type { ReactNode } from "react";
import AdminLayoutClient from "./layoutClient";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <AdminLayoutClient>{children}</AdminLayoutClient>;
}
