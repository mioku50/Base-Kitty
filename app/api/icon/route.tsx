import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const runtime = "nodejs";

async function tryReadPng(path: string): Promise<Buffer | null> {
  try {
    return await readFile(path);
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const customIconFile = "32F53873-4212-4BF4-B478-57D29D58477B.png";
  const customIconCandidates = [
    join(process.cwd(), customIconFile),
    join(process.cwd(), "public", customIconFile),
    join(process.cwd(), "public", "icon.png"),
  ];

  for (const iconPath of customIconCandidates) {
    const imageBuffer = await tryReadPng(iconPath);
    if (!imageBuffer) continue;

    return new Response(imageBuffer, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=0, must-revalidate",
      },
    });
  }

  // Fall back to generated icon if custom files are missing.
  const assetBase = req.nextUrl.origin;
  const kittyHero = new URL("/assets/kitty-hero.png", assetBase).toString();

  return new ImageResponse(
    (
      <div
        style={{
          width: "1024px",
          height: "1024px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "space-between",
          position: "relative",
          overflow: "hidden",
          borderRadius: "240px",
          background:
            "radial-gradient(circle at 50% 18%, #f6ecff 0%, #8aa0ff 38%, #6072db 72%, #2a2f7a 100%)",
        }}
      >
        {/* sky sparkles */}
        {[...Array(18)].map((_, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              width: `${8 + (i % 4) * 5}px`,
              height: `${8 + (i % 4) * 5}px`,
              borderRadius: "999px",
              background: "rgba(255,255,255,0.88)",
              top: `${28 + (i * 41) % 420}px`,
              left: `${40 + (i * 97) % 940}px`,
              boxShadow: "0 0 14px rgba(255,255,255,0.9)",
            }}
          />
        ))}

        {/* top clouds */}
        <div
          style={{
            position: "absolute",
            top: "122px",
            left: "-100px",
            width: "440px",
            height: "190px",
            borderRadius: "200px",
            background: "rgba(255,245,255,0.7)",
            filter: "blur(1px)",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: "162px",
            right: "-110px",
            width: "450px",
            height: "210px",
            borderRadius: "220px",
            background: "rgba(255,250,255,0.75)",
            filter: "blur(1px)",
          }}
        />

        {/* kitty */}
        <div
          style={{
            position: "absolute",
            top: "106px",
            width: "100%",
            height: "530px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <img
            src={kittyHero}
            width={500}
            height={500}
            style={{ objectFit: "contain" }}
          />
        </div>

        {/* title block */}
        <div
          style={{
            position: "absolute",
            bottom: "112px",
            left: "50%",
            transform: "translateX(-50%)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "6px",
            width: "100%",
          }}
        >
          <span
            style={{
              fontSize: "132px",
              fontWeight: 900,
              color: "#def8ff",
              letterSpacing: "-2px",
              textShadow:
                "0 10px 0 rgba(56,79,187,0.85), 0 0 14px rgba(255,255,255,0.45)",
            }}
          >
            Nimbus
          </span>
          <span
            style={{
              fontSize: "148px",
              fontWeight: 900,
              color: "#ffd39a",
              letterSpacing: "-2px",
              textShadow:
                "0 10px 0 rgba(76,53,184,0.9), 0 0 16px rgba(255,255,255,0.45)",
            }}
          >
            Ascent
          </span>
        </div>
      </div>
    ),
    { width: 1024, height: 1024 }
  );
}
