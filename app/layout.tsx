import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "🐋 WHALE FR — Funding Rate Dashboard",
  description: "Live cryptocurrency funding rate monitoring and Z-score signal generation",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
