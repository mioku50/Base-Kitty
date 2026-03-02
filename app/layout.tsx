import type { Metadata } from "next";
import "./globals.css";
import FarcasterProvider from "../components/FarcasterProvider";

const DEFAULT_APP_URL = "https://base-kitty.vercel.app";

function getAppUrl() {
  const raw = process.env.NEXT_PUBLIC_URL?.trim() || DEFAULT_APP_URL;
  return raw.replace(/\/+$/, "");
}

const APP_URL = getAppUrl();
const OG_IMAGE_URL = `${APP_URL}/api/og`;
const APP_ICON_URL = `${APP_URL}/api/icon?v=3`;

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: "Nimbus Ascent",
  description:
    "Nimbus Ascent — a Doodle Jump style MiniApp for Farcaster. Rise from Web2 to Onchain Heaven!",
  openGraph: {
    type: "website",
    url: APP_URL,
    title: "Nimbus Ascent",
    description:
      "Nimbus Ascent — a Doodle Jump style MiniApp for Farcaster. Rise from Web2 to Onchain Heaven!",
    images: [OG_IMAGE_URL],
  },
  twitter: {
    card: "summary_large_image",
    title: "Nimbus Ascent",
    description:
      "Nimbus Ascent — a Doodle Jump style MiniApp for Farcaster. Rise from Web2 to Onchain Heaven!",
    images: [OG_IMAGE_URL],
  },
  icons: {
    icon: APP_ICON_URL,
    apple: APP_ICON_URL,
  },
  other: {
    "base:app_id": "69a595a077bc7576330f4ae7",
    "fc:miniapp": JSON.stringify({
      version: "next",
      imageUrl: OG_IMAGE_URL,
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
