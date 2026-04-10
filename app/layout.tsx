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
const APP_ICON_URL = `${APP_URL}/api/icon?v=5`;

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: "Nimbus Ascent",
  description:
    "Nimbus Ascent — a Doodle Jump style app on Base. Rise from Web2 to Onchain Heaven!",
  openGraph: {
    type: "website",
    url: APP_URL,
    title: "Nimbus Ascent",
    description:
      "Nimbus Ascent — a Doodle Jump style app on Base. Rise from Web2 to Onchain Heaven!",
    images: [OG_IMAGE_URL],
  },
  twitter: {
    card: "summary_large_image",
    title: "Nimbus Ascent",
    description:
      "Nimbus Ascent — a Doodle Jump style app on Base. Rise from Web2 to Onchain Heaven!",
    images: [OG_IMAGE_URL],
  },
  icons: {
    icon: APP_ICON_URL,
    apple: APP_ICON_URL,
  },
  other: {
    "base:app_id": "69a595a077bc7576330f4ae7",
    "talentapp:project_verification":
      "aa6fb1b3935200c57cfe6644502a16f633c8f50f0730db37ab054edd41c41eb63fa1550fa7806a5c5cfb879b183513a07a3c1734dfb0f1d9a7bfd7839746fe18",
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
