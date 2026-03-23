import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const kind = searchParams.get("kind") || "score";
  const scoreParam = searchParams.get("score");
  const hasScore = scoreParam !== null && scoreParam.trim() !== "";
  const score = hasScore ? scoreParam : "0";
  const scoreNumber = Number(score);
  const scoreLabel = Number.isFinite(scoreNumber) ? scoreNumber.toLocaleString() : score;
  const username = searchParams.get("username") || "Anonymous";
  const reward = searchParams.get("reward") || "10";
  const rank = searchParams.get("rank") || "unranked";
  const mode = searchParams.get("mode") || "weekly";
  const prize = searchParams.get("prize") || "10000";
  const viral = searchParams.get("viral") || "Catch me in the clouds before I claim the season bag.";
  const badges = (searchParams.get("badges") || "").split(",").filter(Boolean);
  const stage = Number(searchParams.get("stage") || "0");
  const assetBase = req.nextUrl.origin;
  const kittyHero = new URL("/assets/kitty-hero.png", assetBase).toString();
  const kittyFace = new URL("/assets/kitty-face.png", assetBase).toString();
  const coin = new URL("/assets/Based Energy Coin.PNG", assetBase).toString();

  if (kind === "leaderboard") {
    const rankLabel = rank !== "unranked" ? `#${rank}` : "UNRANKED";
    const modeLabel = mode === "alltime" ? "ALL-TIME" : mode === "friends" ? "FRIENDS" : "WEEKLY";
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
            background:
              "radial-gradient(circle at 20% 18%, #4c2fc0 0%, #162564 42%, #0a132f 100%)",
            fontFamily: "sans-serif",
            position: "relative",
            overflow: "hidden",
          }}
        >
          {[...Array(18)].map((_, i) => (
            <div
              key={i}
              style={{
                position: "absolute",
                width: `${5 + (i % 3) * 4}px`,
                height: `${5 + (i % 3) * 4}px`,
                borderRadius: "50%",
                background: "rgba(180, 225, 255, 0.6)",
                top: `${22 + (i * 31) % 580}px`,
                left: `${20 + (i * 67) % 1160}px`,
              }}
            />
          ))}

          <div
            style={{
              width: "1030px",
              borderRadius: "34px",
              border: "2px solid rgba(164, 228, 255, 0.35)",
              background:
                "linear-gradient(135deg, rgba(22,59,145,0.3) 0%, rgba(42,26,112,0.45) 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "38px 46px",
              gap: "20px",
            }}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                maxWidth: "610px",
              }}
            >
              <span style={{ fontSize: "30px", color: "#b9dfff", fontWeight: 800 }}>
                ⚡ Nimbus Ascent Leaderboard
              </span>
              <span
                style={{
                  marginTop: "8px",
                  fontSize: "84px",
                  lineHeight: 0.95,
                  fontWeight: 900,
                  color: "#ffffff",
                }}
              >
                {rankLabel}
              </span>
              <span style={{ marginTop: "6px", fontSize: "28px", color: "#d4f0ff" }}>
                @{username} • {modeLabel}
              </span>
              <span style={{ marginTop: "8px", fontSize: "34px", color: "#ffffff", fontWeight: 700 }}>
                {scoreLabel} pts
              </span>
              <span style={{ marginTop: "18px", fontSize: "24px", color: "#c8dcff", fontWeight: 700 }}>
                SEASON 1 PRIZE POOL
              </span>
              <span style={{ marginTop: "2px", fontSize: "36px", color: "#f6d0ff", fontWeight: 900 }}>
                {prize} токенов $Degen
              </span>
              <span style={{ marginTop: "14px", fontSize: "24px", color: "#d7eeff" }}>{viral}</span>
            </div>

            <div
              style={{
                width: "300px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "10px",
              }}
            >
              <img src={kittyHero} width={240} height={240} style={{ objectFit: "contain" }} />
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: "999px",
                  border: "1px solid rgba(174, 238, 255, 0.55)",
                  background: "rgba(38, 117, 196, 0.35)",
                  padding: "10px 18px",
                }}
              >
                <span style={{ fontSize: "25px", color: "#e1f6ff", fontWeight: 900 }}>
                  Play in BaseApp
                </span>
              </div>
            </div>
          </div>
        </div>
      ),
      { width: 1200, height: 630 }
    );
  }

  if (kind === "blessing") {
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
            background:
              "radial-gradient(circle at 20% 15%, #3f2a8f 0%, #111f4a 35%, #07192d 100%)",
            fontFamily: "sans-serif",
            position: "relative",
            overflow: "hidden",
          }}
        >
          {[...Array(18)].map((_, i) => (
            <div
              key={i}
              style={{
                position: "absolute",
                width: `${6 + (i % 4) * 3}px`,
                height: `${6 + (i % 4) * 3}px`,
                borderRadius: "50%",
                background: "rgba(174, 238, 255, 0.6)",
                top: `${15 + (i * 31) % 570}px`,
                left: `${20 + (i * 67) % 1160}px`,
              }}
            />
          ))}

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "14px",
              marginBottom: "18px",
            }}
          >
            <span style={{ fontSize: "54px" }}>☁️</span>
            <span
              style={{
                fontSize: "56px",
                fontWeight: 900,
                color: "white",
                letterSpacing: "-1px",
              }}
            >
              Nimbus Ascent
            </span>
          </div>

          <div
            style={{
              width: "980px",
              borderRadius: "36px",
              border: "2px solid rgba(158, 233, 255, 0.35)",
              background:
                "linear-gradient(135deg, rgba(38,67,173,0.25) 0%, rgba(22,87,145,0.25) 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "40px 58px",
            }}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                maxWidth: "560px",
              }}
            >
              <span
                style={{
                  fontSize: "54px",
                  fontWeight: 900,
                  color: "#d9f6ff",
                  lineHeight: 1.05,
                }}
              >
                💙 Daily Blessing Claimed
              </span>
              <span
                style={{
                  marginTop: "12px",
                  fontSize: "30px",
                  color: "rgba(222,245,255,0.9)",
                }}
              >
                @{username} unlocked {reward} $DEGEN
              </span>
              <span
                style={{
                  marginTop: "18px",
                  fontSize: "26px",
                  fontWeight: 700,
                  color: "#c9e2ff",
                }}
              >
                Nimbus kitty hugs a blue DEGEN heart
              </span>
            </div>

            <div
              style={{
                width: "280px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <img
                src={kittyHero}
                width={220}
                height={220}
                style={{ objectFit: "contain" }}
              />
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "10px 18px",
                  borderRadius: "999px",
                  border: "1px solid rgba(174, 238, 255, 0.55)",
                  background: "rgba(40, 121, 193, 0.35)",
                  color: "#e1f6ff",
                  fontSize: "26px",
                  fontWeight: 900,
                }}
              >
                💙 DEGEN TOKEN
              </div>
            </div>
          </div>

          <div
            style={{
              marginTop: "26px",
              display: "flex",
              alignItems: "center",
              gap: "10px",
              background: "linear-gradient(135deg, #8B5CF6 0%, #3B82F6 100%)",
              borderRadius: "24px",
              padding: "14px 36px",
            }}
          >
            <img
              src={kittyFace}
              width={22}
              height={22}
              style={{ objectFit: "contain" }}
            />
            <span style={{ fontSize: "22px", fontWeight: 700, color: "white" }}>
              Play in BaseApp
            </span>
          </div>
        </div>
      ),
      { width: 1200, height: 630 }
    );
  }

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
          <img
            src={kittyHero}
            width={56}
            height={56}
            style={{ objectFit: "contain" }}
          />
          <span
            style={{
              fontSize: "52px",
              fontWeight: 800,
              color: "white",
              letterSpacing: "-1px",
            }}
          >
            Nimbus Ascent
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
          <img
            src={kittyHero}
            width={140}
            height={180}
            style={{ objectFit: "contain" }}
          />
        </div>

        {/* Score or app tagline */}
        {hasScore ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              marginBottom: "16px",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: "12px",
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
                  {scoreLabel}
                </span>
              <span style={{ fontSize: "32px", color: "rgba(255,255,255,0.7)" }}>
                pts
              </span>
            </div>
            <span
              style={{
                fontSize: "28px",
                color: "rgba(255,255,255,0.8)",
                marginTop: "2px",
              }}
            >
              by @{username}
            </span>
          </div>
        ) : (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "8px",
              marginBottom: "16px",
              maxWidth: "860px",
            }}
          >
            <span
              style={{
                fontSize: "44px",
                fontWeight: 800,
                color: "white",
                textAlign: "center",
              }}
            >
              Rise from Web2 to Onchain Heaven
            </span>
            <span
              style={{
                fontSize: "30px",
                color: "rgba(255,255,255,0.8)",
                textAlign: "center",
              }}
            >
              Play Nimbus Ascent
            </span>
          </div>
        )}

        {/* Badges */}
        {hasScore && badges.length > 0 && (
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
                    <img
                      src={coin}
                      width={20}
                      height={20}
                      style={{ objectFit: "contain" }}
                    />
                  ) : badge.includes("Legend") || badge.includes("Master") ? (
                    <img
                      src={kittyFace}
                      width={20}
                      height={20}
                      style={{ objectFit: "contain" }}
                    />
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
          <img
            src={kittyFace}
            width={22}
            height={22}
            style={{ objectFit: "contain" }}
          />
          <span style={{ fontSize: "22px", fontWeight: 700, color: "white" }}>
            Play in BaseApp
          </span>
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
