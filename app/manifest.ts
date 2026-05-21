import type { MetadataRoute } from "next";

const DEFAULT_APP_URL = "https://base-kitty.vercel.app";

function getAppUrl() {
  const raw = process.env.NEXT_PUBLIC_URL?.trim() || DEFAULT_APP_URL;
  return raw.replace(/\/+$/, "");
}

export default function manifest(): MetadataRoute.Manifest {
  const appUrl = getAppUrl();

  return {
    name: "Nimbus Ascent",
    short_name: "Nimbus Ascent",
    description:
      "Jump through clouds, defeat FUD Bears, collect Base Energy and rise to Onchain Heaven!",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#0a0020",
    theme_color: "#0a0020",
    icons: [
      {
        src: `${appUrl}/icon.png?v=6`,
        sizes: "288x288",
        type: "image/png",
        purpose: "any",
      },
      {
        src: `${appUrl}/icon.png?v=6`,
        sizes: "288x288",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
