export interface GameStats {
  score: number;
  enemiesKilled: number;
  coinsCollected: number;
  maxStage: number;        // 0, 1, or 2
  prayersUsed: number;
  platformsReached: number;
}

export type GameOverCallback = (stats: GameStats) => void;

// Events the Phaser scene emits to the React layer
export const GAME_EVENTS = {
  PAUSE:      "game:pause",
  RESUME:     "game:resume",
  RESTART:    "game:restart",
  LEADERBOARD:"game:leaderboard",
  BOOST_POPUP:"game:boost-popup",   // { username: string }
} as const;

export interface SocialFriend {
  fid: number;
  username: string;
  pfpUrl: string;       // used as cloud texture URL
}
