export interface GameStats {
  score: number;
  enemiesKilled: number;
  coinsCollected: number;
  maxStage: number;        // 0, 1, or 2
  prayersUsed: number;
  platformsReached: number;
}

export type GameOverCallback = (stats: GameStats) => void;
