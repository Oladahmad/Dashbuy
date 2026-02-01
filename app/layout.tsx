import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Dashbuy",
  description: "Fast food and products around Ago",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
