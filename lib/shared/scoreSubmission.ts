"use client";

export type ScoreSubmissionPayload = {
  fid: number;
  username: string;
  displayName: string;
  pfpUrl: string;
  score: number;
  enemiesKilled: number;
  coinsCollected: number;
  maxStage: number;
  prayersUsed: number;
  referrerFid?: number;
  runId?: string;
};

type PendingScoreSubmission = ScoreSubmissionPayload & {
  queuedAt: number;
};

type ScoreSubmissionResponse = {
  ok?: boolean;
  bestScore?: number;
  badges?: string[];
};

const PENDING_SCORES_KEY = "nimbus_ascent:pending_scores:v1";
const MAX_PENDING_SCORES = 40;

function runKey(payload: ScoreSubmissionPayload): string {
  if (payload.runId && payload.runId.trim().length > 0) {
    return payload.runId.trim();
  }
  return `${payload.fid}:${payload.score}:${payload.maxStage}:${payload.enemiesKilled}:${payload.coinsCollected}:${payload.prayersUsed}`;
}

function readPendingScores(): PendingScoreSubmission[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(PENDING_SCORES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PendingScoreSubmission[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry) =>
      entry &&
      typeof entry === "object" &&
      Number.isFinite(entry.fid) &&
      Number.isFinite(entry.score)
    );
  } catch {
    return [];
  }
}

function writePendingScores(entries: PendingScoreSubmission[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PENDING_SCORES_KEY, JSON.stringify(entries));
  } catch {
    // Ignore localStorage quota and access errors.
  }
}

function upsertPendingScore(payload: ScoreSubmissionPayload) {
  const key = runKey(payload);
  const existing = readPendingScores();
  const filtered = existing.filter((item) => runKey(item) !== key);
  filtered.push({ ...payload, queuedAt: Date.now() });
  filtered.sort((a, b) => a.queuedAt - b.queuedAt);
  const bounded = filtered.slice(Math.max(0, filtered.length - MAX_PENDING_SCORES));
  writePendingScores(bounded);
}

function removePendingScore(payload: ScoreSubmissionPayload) {
  const key = runKey(payload);
  const remaining = readPendingScores().filter((item) => runKey(item) !== key);
  writePendingScores(remaining);
}

async function postScore(
  payload: ScoreSubmissionPayload,
  authToken: string | null,
  keepalive = false
): Promise<ScoreSubmissionResponse | null> {
  const doRequest = async (token: string | null) => {
    const response = await fetch("/api/score", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(payload),
      keepalive,
    });
    return response;
  };

  try {
    let response = await doRequest(authToken);
    if (!response.ok && authToken && (response.status === 401 || response.status === 403)) {
      response = await doRequest(null);
    }
    if (!response.ok) return null;

    const data = (await response.json().catch(() => ({}))) as ScoreSubmissionResponse;
    return data;
  } catch {
    return null;
  }
}

export async function submitScoreReliably(
  payload: ScoreSubmissionPayload,
  authToken: string | null,
  options?: { keepalive?: boolean }
): Promise<ScoreSubmissionResponse | null> {
  upsertPendingScore(payload);
  const response = await postScore(payload, authToken, Boolean(options?.keepalive));
  if (response && response.ok) {
    removePendingScore(payload);
    return response;
  }
  return null;
}

export async function flushPendingScores(authToken: string | null): Promise<void> {
  const queue = readPendingScores();
  if (queue.length === 0) return;

  const failed: PendingScoreSubmission[] = [];
  for (const pending of queue) {
    const payload: ScoreSubmissionPayload = {
      fid: pending.fid,
      username: pending.username,
      displayName: pending.displayName,
      pfpUrl: pending.pfpUrl,
      score: pending.score,
      enemiesKilled: pending.enemiesKilled,
      coinsCollected: pending.coinsCollected,
      maxStage: pending.maxStage,
      prayersUsed: pending.prayersUsed,
      referrerFid: pending.referrerFid,
      runId: pending.runId,
    };

    const response = await postScore(payload, authToken, false);
    if (!response || !response.ok) {
      failed.push(pending);
    }
  }

  writePendingScores(failed);
}
