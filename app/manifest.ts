import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Dashbuy",
    short_name: "Dashbuy",
    description: "Fast food and products around Ago",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#000000",
    orientation: "portrait",
    icons: [
      {
        src: "/favicon.ico",
        sizes: "48x48",
        type: "image/x-icon",
      },
      {
        src: "/icons/icon-192.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
      {
        src: "/icons/icon-512.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
    ],
  };
}

