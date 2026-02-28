"use client";

import FarcasterProvider from "./FarcasterProvider";
import GameLoader from "./GameLoader";

export interface AppProps {
  title?: string;
}

export default function App({ title }: AppProps = {}) {
  return (
    <FarcasterProvider>
      <main className="flex items-center justify-center w-full h-screen bg-black overflow-hidden">
        <div className="relative w-full max-w-[400px] h-[650px]">
          <GameLoader />
        </div>
      </main>
    </FarcasterProvider>
  );
}
