import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Unified Inbox",
  description: "WhatsApp + Instagram inbox for e-commerce brands",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="tr">
      <body>{children}</body>
    </html>
  );
}
