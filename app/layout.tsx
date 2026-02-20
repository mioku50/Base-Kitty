import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Base Kitty",
  description:
    "Base Kitty — a Doodle Jump style MiniApp for Farcaster. Rise from Web2 to Onchain Heaven!",
  openGraph: {
    title: "Base Kitty",
    description:
      "Base Kitty — a Doodle Jump style MiniApp for Farcaster. Rise from Web2 to Onchain Heaven!",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
