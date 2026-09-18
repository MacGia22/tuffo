import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

// Self-hosted variable fonts (SIL OFL), fetched by scripts/fetch-fonts.mjs before build.
const sora = localFont({
  src: "../fonts/sora-variable.ttf",
  variable: "--font-sora",
  weight: "100 800",
  display: "swap",
});

const manrope = localFont({
  src: "../fonts/manrope-variable.ttf",
  variable: "--font-manrope",
  weight: "200 800",
  display: "swap",
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://tuffo.app";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Tuffo — your pool, forecast.",
    template: "%s · Tuffo",
  },
  description:
    "Log your pool water tests, see what the sun, heat and rain did between them, and get a 7-day dosing plan for your pool.",
  applicationName: "Tuffo",
  openGraph: {
    type: "website",
    siteName: "Tuffo",
    title: "Tuffo — your pool, forecast.",
    description:
      "Pool chemistry that knows your weather. Log a test, see why chlorine moved, plan the week ahead.",
  },
  twitter: {
    card: "summary_large_image",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#0e7c9e" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1620" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${sora.variable} ${manrope.variable} h-full`}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
