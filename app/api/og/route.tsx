import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";

export const runtime = "edge";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const score = searchParams.get("score") || "0";
  const username = searchParams.get("username") || "Anonymous";
  const badges = (searchParams.get("badges") || "").split(",").filter(Boolean);
  const stage = Number(searchParams.get("stage") || "0");

  const isDefaultCard = score === "0" && username === "Anonymous";

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
        {[...Array(15)].map((_, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              width: `${4 + (i % 5) * 3}px`,
              height: `${4 + (i % 5) * 3}px`,
              borderRadius: "50%",
              background: `rgba(255,255,255,${0.15 + (i % 3) * 0.15})`,
              top: `${10 + (i * 43) % 600}px`,
              left: `${20 + (i * 83) % 1160}px`,
            }}
          />
        ))}

        {/* Title */}
        <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "16px" }}>
          <span style={{ fontSize: "64px" }}>😺</span>
          <span style={{ fontSize: "56px", fontWeight: 800, color: "white", letterSpacing: "-2px" }}>
            Base Kitty Jump
          </span>
          <span style={{ fontSize: "64px" }}>☁️</span>
        </div>

        {isDefaultCard ? (
          /* Default card — no score, just game promo */
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "16px" }}>
            <span style={{ fontSize: "120px" }}>🐱</span>
            <span style={{ fontSize: "32px", color: "rgba(255,255,255,0.8)", textAlign: "center" }}>
              Rise from Web2 to Onchain Heaven! ☁️✨
            </span>
            <div style={{
              display: "flex", alignItems: "center", gap: "12px",
              background: "linear-gradient(135deg, #8B5CF6 0%, #3B82F6 100%)",
              borderRadius: "24px", padding: "16px 40px", marginTop: "8px",
            }}>
              <span style={{ fontSize: "24px", fontWeight: 700, color: "white" }}>
                😺 Play Now in Farcaster
              </span>
            </div>
          </div>
        ) : (
          /* Score card — after game over share */
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            <span style={{ fontSize: "80px", marginBottom: "4px" }}>🐱</span>

            {/* Score */}
            <div style={{ display: "flex", alignItems: "baseline", gap: "12px", marginBottom: "12px" }}>
              <span style={{
                fontSize: "80px", fontWeight: 900,
                background: "linear-gradient(90deg, #a78bfa, #60a5fa, #34d399)",
                backgroundClip: "text", color: "transparent",
              }}>
                {Number(score).toLocaleString()}
              </span>
              <span style={{ fontSize: "36px", color: "rgba(255,255,255,0.6)" }}>pts</span>
            </div>

            {/* Username */}
            <span style={{ fontSize: "28px", color: "rgba(255,255,255,0.7)", marginBottom: "16px" }}>
              by @{username}
            </span>

            {/* Badges */}
            {badges.length > 0 && (
              <div style={{
                display: "flex", flexWrap: "wrap", gap: "10px",
                justifyContent: "center", marginBottom: "20px", maxWidth: "900px",
              }}>
                {badges.slice(0, 4).map((badge, i) => (
                  <div key={i} style={{
                    display: "flex", alignItems: "center", gap: "8px",
                    background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)",
                    borderRadius: "20px", padding: "8px 20px",
                  }}>
                    <span style={{ fontSize: "20px" }}>
                      {badge.includes("Bear") ? "🐻" : badge.includes("Stage") ? "🚀" : badge.includes("Prayer") ? "😇" : badge.includes("Coin") ? "🪙" : "⭐"}
                    </span>
                    <span style={{ fontSize: "18px", fontWeight: 700, color: "white" }}>{badge}</span>
                  </div>
                ))}
              </div>
            )}

            {/* CTA */}
            <div style={{
              display: "flex", alignItems: "center", gap: "10px",
              background: "linear-gradient(135deg, #8B5CF6 0%, #3B82F6 100%)",
              borderRadius: "24px", padding: "14px 36px",
            }}>
              <span style={{ fontSize: "22px", fontWeight: 700, color: "white" }}>
                😺 Can you beat me?
              </span>
            </div>
          </div>
        )}
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
