import type { Metadata } from "next";
import "./globals.css";
import FarcasterProvider from "../components/FarcasterProvider";

const DEFAULT_APP_URL = "https://base-kitty.vercel.app";

function getAppUrl() {
  const raw = process.env.NEXT_PUBLIC_URL?.trim() || DEFAULT_APP_URL;
  return raw.replace(/\/+$/, "");
}

const APP_URL = getAppUrl();

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
