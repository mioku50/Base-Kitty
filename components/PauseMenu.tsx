"use client";

interface Props {
  onResume: () => void;
  onRestart: () => void;
  onLeaderboard: () => void;
  soundEnabled: boolean;
  onToggleSound: () => void;
}

export default function PauseMenu({
  onResume,
  onRestart,
  onLeaderboard,
  soundEnabled,
  onToggleSound,
}: Props) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center z-40 bg-black/70 backdrop-blur-sm">
      {/* Card */}
      <div className="w-full max-w-[240px] rounded-3xl border border-white/10 overflow-hidden shadow-2xl shadow-black/60"
        style={{ background: "linear-gradient(160deg, #1e0640 0%, #0d1b2a 100%)" }}
      >
        {/* Header */}
        <div className="flex flex-col items-center pt-6 pb-4 border-b border-white/8">
          <span className="text-4xl mb-1">😺</span>
          <p className="text-white font-black text-lg tracking-tight">Paused</p>
        </div>

        {/* Buttons */}
        <div className="flex flex-col gap-2 p-4">
          <button
            onClick={onResume}
            className="w-full py-3 rounded-2xl font-black text-white text-sm active:scale-95 transition-transform shadow-lg shadow-purple-500/20"
            style={{ background: "linear-gradient(135deg, #8B5CF6 0%, #3B82F6 100%)" }}
          >
            ▶ Resume
          </button>

          <button
            onClick={onRestart}
            className="w-full py-3 rounded-2xl font-bold text-white text-sm border border-white/15 hover:bg-white/8 active:scale-95 transition-all"
          >
            🔄 Restart
          </button>

          <button
            onClick={onLeaderboard}
            className="w-full py-3 rounded-2xl font-bold text-white text-sm border border-white/15 hover:bg-white/8 active:scale-95 transition-all"
          >
            🏆 Leaderboard
          </button>

          <button
            onClick={onToggleSound}
            className="w-full py-3 rounded-2xl font-bold text-sm border border-white/15 hover:bg-white/8 active:scale-95 transition-all"
            style={{ color: soundEnabled ? "#a78bfa" : "#6b7280" }}
          >
            {soundEnabled ? "🔊 Sound On" : "🔇 Sound Off"}
          </button>
        </div>
      </div>
    </div>
  );
}
