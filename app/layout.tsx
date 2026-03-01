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
  title: "Nimbus Ascent",
  description:
    "Nimbus Ascent — a Doodle Jump style MiniApp for Farcaster. Rise from Web2 to Onchain Heaven!",
  openGraph: {
    title: "Nimbus Ascent",
    description:
      "Nimbus Ascent — a Doodle Jump style MiniApp for Farcaster. Rise from Web2 to Onchain Heaven!",
    images: [`${APP_URL}/api/og`],
  },
  other: {
    "fc:miniapp": JSON.stringify({
      version: "next",
      imageUrl: `${APP_URL}/api/og`,
      button: {
        title: "Play Nimbus Ascent",
        action: {
          type: "launch_miniapp",
          name: "Nimbus Ascent",
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
