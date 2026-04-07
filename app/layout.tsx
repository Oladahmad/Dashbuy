import type { Metadata } from "next";
import "./globals.css";
import type { Viewport } from "next";
import PwaRegister from "@/components/PwaRegister";
import PwaPullToRefresh from "@/components/PwaPullToRefresh";
import PwaPushSubscribe from "@/components/PwaPushSubscribe";

export const metadata: Metadata = {
  title: "Dashbuy",
  description: "Fast food and products around Ago",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/apple-icon.png",
    shortcut: "/icons/icon-192.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Dashbuy",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <PwaRegister />
        <PwaPushSubscribe />
        <PwaPullToRefresh />
        {children}
      </body>
    </html>
  );
}
