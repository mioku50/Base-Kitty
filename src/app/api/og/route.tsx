import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";
import { APP_URL } from "~/lib/constants";

export const runtime = "edge";

async function loadAsset(filename: string): Promise<ArrayBuffer | null> {
  try {
    const res = await fetch(`${APP_URL}${filename}`);
    if (!res.ok) return null;
    return res.arrayBuffer();
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const score = searchParams.get("score") || "0";
  const username = searchParams.get("username") || "Anonymous";
  const badges = (searchParams.get("badges") || "").split(",").filter(Boolean);
  const stage = Number(searchParams.get("stage") || "0");

  const isDefaultCard = score === "0" && username === "Anonymous";

  const [kittyHero, kittyFace, coin] = await Promise.all([
    loadAsset("/assets/kitty-hero.png"),
    loadAsset("/assets/kitty-face.png"),
    loadAsset("/assets/Based Energy Coin.PNG"),
  ]);

  // Stage-dependent gradient
  const gradients = [
    "linear-gradient(135deg, #1a0533 0%, #0d1b2a 50%, #1b2838 100%)",
    "linear-gradient(135deg, #1a1040 0%, #0a2463 50%, #3e1f7a 100%)",
    "linear-gradient(135deg, #2d0a4e 0%, #4a1a8a 50%, #ff6b35 100%)",
  ];
  const bg = gradients[Math.min(stage, 2)];

  return new ImageResponse(
    (
      <div
        style={{
          width: "1200px",
          height: "630px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: bg,
          fontFamily: "sans-serif",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Decorative stars */}
        {[...Array(12)].map((_, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              width: `${6 + (i % 4) * 3}px`,
              height: `${6 + (i % 4) * 3}px`,
              borderRadius: "50%",
              background: "rgba(255,255,255,0.4)",
              top: `${10 + (i * 47) % 580}px`,
              left: `${30 + (i * 97) % 1140}px`,
            }}
          />
        ))}

        {/* Top banner */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "16px",
            marginBottom: "8px",
          }}
        >
          {kittyHero && (
            <img
              src={kittyHero as unknown as string}
              width={56}
              height={56}
              style={{ objectFit: "contain" }}
            />
          )}
          <span
            style={{
              fontSize: "52px",
              fontWeight: 800,
              color: "white",
              letterSpacing: "-1px",
            }}
          >
            Base Kitty Jump
          </span>
          <span style={{ fontSize: "56px" }}>😇</span>
        </div>

        {/* Kitty + halo */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            marginBottom: "12px",
          }}
        >
          <span style={{ fontSize: "28px", marginBottom: "-8px" }}>✨</span>
          {kittyHero && (
            <img
              src={kittyHero as unknown as string}
              width={140}
              height={180}
              style={{ objectFit: "contain" }}
            />
          )}
        </div>

        {/* Score — hidden for default card */}
        {!isDefaultCard && (
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: "12px",
              marginBottom: "16px",
            }}
          >
            <span
              style={{
                fontSize: "72px",
                fontWeight: 900,
                background: "linear-gradient(90deg, #a78bfa, #60a5fa, #34d399)",
                backgroundClip: "text",
                color: "transparent",
              }}
            >
              {Number(score).toLocaleString()}
            </span>
            <span style={{ fontSize: "32px", color: "rgba(255,255,255,0.7)" }}>
              pts
            </span>
          </div>
        )}

        {/* Username — hidden for default card */}
        {!isDefaultCard && (
          <span
            style={{
              fontSize: "28px",
              color: "rgba(255,255,255,0.8)",
              marginBottom: "16px",
            }}
          >
            by @{username}
          </span>
        )}

        {/* Badges */}
        {badges.length > 0 && (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "10px",
              justifyContent: "center",
              marginBottom: "20px",
              maxWidth: "900px",
            }}
          >
            {badges.slice(0, 4).map((badge, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  background: "rgba(255,255,255,0.12)",
                  border: "1px solid rgba(255,255,255,0.2)",
                  borderRadius: "20px",
                  padding: "8px 18px",
                }}
              >
                <span style={{ fontSize: "20px", display: "flex", alignItems: "center" }}>
                  {badge.includes("Bear") ? (
                    "🐻"
                  ) : badge.includes("Stage") ? (
                    "🚀"
                  ) : badge.includes("Prayer") ? (
                    "😇"
                  ) : badge.includes("Coin") ? (
                    coin ? (
                      <img
                        src={coin as unknown as string}
                        width={20}
                        height={20}
                        style={{ objectFit: "contain" }}
                      />
                    ) : "🪙"
                  ) : badge.includes("Legend") || badge.includes("Master") ? (
                    kittyFace ? (
                      <img
                        src={kittyFace as unknown as string}
                        width={20}
                        height={20}
                        style={{ objectFit: "contain" }}
                      />
                    ) : "🐱"
                  ) : (
                    "⭐"
                  )}
                </span>
                <span
                  style={{
                    fontSize: "18px",
                    fontWeight: 700,
                    color: "white",
                  }}
                >
                  {badge}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* CTA */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            background: "linear-gradient(135deg, #8B5CF6 0%, #3B82F6 100%)",
            borderRadius: "24px",
            padding: "14px 36px",
          }}
        >
          {kittyFace && (
            <img
              src={kittyFace as unknown as string}
              width={22}
              height={22}
              style={{ objectFit: "contain" }}
            />
          )}
          <span style={{ fontSize: "22px", fontWeight: 700, color: "white" }}>
            {isDefaultCard ? "Play Base Kitty Jump" : "Play in Farcaster"}
          </span>
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
