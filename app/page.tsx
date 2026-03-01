import GameLoader from "../components/GameLoader";

export default function Home() {
  return (
    <main className="w-full h-screen h-[100dvh] bg-black overflow-hidden">
      <div className="relative mx-auto w-full max-w-[400px] h-full">
        <GameLoader />
      </div>
    </main>
  );
}
