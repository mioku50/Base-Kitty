import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const assetBase = req.nextUrl.origin;
  const kittyFace = new URL("/assets/kitty-face.png", assetBase).toString();

  return new ImageResponse(
    (
      <div
        style={{
          width: "512px",
          height: "512px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          overflow: "hidden",
          borderRadius: "110px",
          background:
            "radial-gradient(circle at 30% 20%, #8b5cf6 0%, #3b82f6 55%, #140025 100%)",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: "14px",
            borderRadius: "96px",
            border: "2px solid rgba(255,255,255,0.2)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <img
            src={kittyFace}
            width={280}
            height={280}
            style={{ objectFit: "contain" }}
          />
        </div>

        <span
          style={{
            position: "absolute",
            top: "48px",
            left: "50%",
            transform: "translateX(-50%)",
            color: "#fff",
            fontSize: "44px",
            fontWeight: 900,
            letterSpacing: "-1px",
            textShadow: "0 8px 24px rgba(0,0,0,0.35)",
          }}
        >
          Nimbus
        </span>
      </div>
    ),
    { width: 512, height: 512 }
  );
}
