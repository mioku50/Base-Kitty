import GameLoader from "../components/GameLoader";

export default function Home() {
  return (
    <main className="flex items-center justify-center w-full h-[100svh] bg-black overflow-hidden">
      <div className="relative w-full max-w-[400px] aspect-[400/650] max-h-[100svh]">
        <GameLoader />
      </div>
    </main>
  );
}
