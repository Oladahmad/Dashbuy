import { ReactNode } from "react";
import VendorLayoutClient from "./vendorLayoutClient";

export default function VendorLayout({ children }: { children: ReactNode }) {
  return <VendorLayoutClient>{children}</VendorLayoutClient>;
}
