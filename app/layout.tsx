import type { Metadata, Viewport } from "next";
import { MoneyTrailProvider } from "@/components/MoneyTrailProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "MoneyTrail — know where your money went", template: "%s · MoneyTrail" },
  description: "Reconcile orders against bank, POS, and payment evidence. Find what needs your attention, without replacing the tools you already use.",
};

export const viewport: Viewport = { themeColor: "#f5f7f4", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><MoneyTrailProvider>{children}</MoneyTrailProvider></body></html>;
}
