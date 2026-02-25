import type { Metadata } from "next";
import "./globals.css";
import FarcasterProvider from "../components/FarcasterProvider";

const APP_URL = process.env.NEXT_PUBLIC_URL || "https://base-kitty.vercel.app";

export const metadata: Metadata = {
  title: "Base Kitty",
  description:
    "Base Kitty — a Doodle Jump style MiniApp for Farcaster. Rise from Web2 to Onchain Heaven!",
  openGraph: {
    title: "Base Kitty",
    description:
      "Base Kitty — a Doodle Jump style MiniApp for Farcaster. Rise from Web2 to Onchain Heaven!",
    images: [`${APP_URL}/og.png`],
  },
  other: {
    "fc:miniapp": JSON.stringify({
      version: "next",
      imageUrl: `${APP_URL}/og.png`,
      button: {
        title: "Play Base Kitty",
        action: {
          type: "launch_miniapp",
          name: "Base Kitty Jump",
          url: APP_URL,
        },
      },
    }),
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <FarcasterProvider>{children}</FarcasterProvider>
      </body>
    </html>
  );
}
