import { NextResponse } from "next/server";

const ICON_VERSION = "6";

export async function GET() {
  const rawUrl = process.env.NEXT_PUBLIC_URL?.trim() || "https://base-kitty.vercel.app";
  const URL = rawUrl.replace(/\/+$/, "");
  const ogImageUrl = `${URL}/api/og`;
  const iconUrl = `${URL}/icon.png?v=${ICON_VERSION}`;

  return NextResponse.json(
    {
      accountAssociation: {
        header: process.env.FARCASTER_HEADER ?? "",
        payload: process.env.FARCASTER_PAYLOAD ?? "",
        signature: process.env.FARCASTER_SIGNATURE ?? "",
      },
      miniapp: {
        version: "1",
        name: "Nimbus Ascent",
        homeUrl: URL,
        iconUrl,
        splashImageUrl: `${URL}/splash.png`,
        splashBackgroundColor: "#0a0020",
        webhookUrl: `${URL}/api/webhook`,
        subtitle: "Doodle Jump style MiniApp",
        description:
          "Jump through clouds, defeat FUD Bears, collect Base Energy and rise to Onchain Heaven!",
        screenshotUrls: [],
        primaryCategory: "games",
        tags: ["base", "game", "farcaster", "jump"],
        heroImageUrl: ogImageUrl,
        ogTitle: "Nimbus Ascent",
        ogDescription:
          "Rise from Web2 to Onchain Heaven! A Doodle Jump style MiniApp for Farcaster.",
        ogImageUrl,
      },
    },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    }
  );
}
