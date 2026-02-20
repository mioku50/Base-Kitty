"use client";

import dynamic from "next/dynamic";

// Dynamically import PhaserGame to avoid SSR issues with the window object
const PhaserGame = dynamic(() => import("./PhaserGame"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center w-full h-full bg-[#0a0020] text-white text-lg">
      Loading Base Kitty…
    </div>
  ),
});

export default function GameLoader() {
  return <PhaserGame />;
}
