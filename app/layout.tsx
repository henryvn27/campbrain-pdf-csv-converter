import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CampBrain PDF to CSV Converter",
  description: "Client-side CampBrain PDF roster parser that exports cabin, camper name, and T-shirt size CSV files.",
  icons: {
    icon: [
      { url: "/logo.svg", type: "image/svg+xml" },
      { url: "/favicon-16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" }
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }]
  }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
