import { ReactNode } from "react";
import LogisticsLayoutClient from "./logisticsLayoutClient";

export default function LogisticsLayout({ children }: { children: ReactNode }) {
  return <LogisticsLayoutClient>{children}</LogisticsLayoutClient>;
}
