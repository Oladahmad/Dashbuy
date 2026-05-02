"use client";

import dynamic from "next/dynamic";

const SmartMenuImportClient = dynamic(() => import("@/components/vendor/SmartMenuImportClient"), {
  ssr: false,
});

export default function VendorFoodImportPage() {
  return <SmartMenuImportClient />;
}
