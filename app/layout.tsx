import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "GHOSTLINE // V1 CORE", description: "Autonomous revenue engine" };

export default function RootLayout({ children }: Readonly<{children: React.ReactNode}>) {
  return <html lang="en"><body>{children}</body></html>;
}
