import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Tuffo",
    short_name: "Tuffo",
    description:
      "Pool chemistry that knows your weather. Log a test, see why chlorine moved, plan the week ahead.",
    start_url: "/",
    display: "standalone",
    background_color: "#f6fafc",
    theme_color: "#0e7c9e",
    icons: [
      { src: "/pwa/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/pwa/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/pwa/maskable-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/pwa/maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
