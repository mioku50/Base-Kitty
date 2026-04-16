import { neon } from "@neondatabase/serverless";
import { createPublicClient, http, toCoinType, type Address } from "viem";
import { base, mainnet } from "viem/chains";

export type NeonSql = ReturnType<typeof neon>;

let scoresEnsured = false;
let notificationEnsured = false;
let rewardTablesEnsured = false;
let walletIdentitiesEnsured = false;
let basenameClient: ReturnType<typeof createPublicClient> | null = null;
let basenameClientRpc: string | null = null;

export function getSqlClient(): NeonSql {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not configured");
  }
  return neon(databaseUrl);
}

export async function ensureScoresTable(sql: NeonSql) {
  if (scoresEnsured) return;

  await sql`
    CREATE TABLE IF NOT EXISTS scores (
      fid INTEGER PRIMARY KEY,
      username TEXT NOT NULL,
      display_name TEXT NOT NULL DEFAULT '',
      pfp_url TEXT NOT NULL DEFAULT '',
      best_score INTEGER NOT NULL DEFAULT 0,
      weekly_score INTEGER NOT NULL DEFAULT 0,
      week_key TEXT NOT NULL DEFAULT '',
      enemies_killed INTEGER NOT NULL DEFAULT 0,
      coins_collected INTEGER NOT NULL DEFAULT 0,
      max_stage INTEGER NOT NULL DEFAULT 0,
      prayers_used INTEGER NOT NULL DEFAULT 0,
      games_played INTEGER NOT NULL DEFAULT 1,
      timestamp BIGINT NOT NULL DEFAULT 0,
      last_played_at BIGINT NOT NULL DEFAULT 0,
      last_run_items_collected INTEGER NOT NULL DEFAULT 0,
      last_revive_at BIGINT NOT NULL DEFAULT 0
    )
  `;

  await sql`ALTER TABLE scores ADD COLUMN IF NOT EXISTS last_played_at BIGINT NOT NULL DEFAULT 0`;
  await sql`ALTER TABLE scores ADD COLUMN IF NOT EXISTS last_run_items_collected INTEGER NOT NULL DEFAULT 0`;
  await sql`ALTER TABLE scores ADD COLUMN IF NOT EXISTS last_revive_at BIGINT NOT NULL DEFAULT 0`;

  scoresEnsured = true;
}

export async function ensureNotificationTable(sql: NeonSql) {
  if (notificationEnsured) return;

  await sql`
    CREATE TABLE IF NOT EXISTS miniapp_notifications (
      fid INTEGER PRIMARY KEY,
      notification_url TEXT NOT NULL DEFAULT '',
      notification_token TEXT NOT NULL DEFAULT '',
      enabled BOOLEAN NOT NULL DEFAULT FALSE,
      updated_at BIGINT NOT NULL DEFAULT 0,
      last_notified_utc_date TEXT NOT NULL DEFAULT ''
    )
  `;

  await sql`ALTER TABLE miniapp_notifications ADD COLUMN IF NOT EXISTS notification_url TEXT NOT NULL DEFAULT ''`;
  await sql`ALTER TABLE miniapp_notifications ADD COLUMN IF NOT EXISTS notification_token TEXT NOT NULL DEFAULT ''`;
  await sql`ALTER TABLE miniapp_notifications ADD COLUMN IF NOT EXISTS enabled BOOLEAN NOT NULL DEFAULT FALSE`;
  await sql`ALTER TABLE miniapp_notifications ADD COLUMN IF NOT EXISTS updated_at BIGINT NOT NULL DEFAULT 0`;
  await sql`ALTER TABLE miniapp_notifications ADD COLUMN IF NOT EXISTS last_notified_utc_date TEXT NOT NULL DEFAULT ''`;

  notificationEnsured = true;
}

export async function ensureRewardTables(sql: NeonSql) {
  if (rewardTablesEnsured) return;

  await sql`
    CREATE TABLE IF NOT EXISTS player_streaks (
      fid INTEGER PRIMARY KEY,
      streak_days INTEGER NOT NULL DEFAULT 0,
      last_play_day TEXT NOT NULL DEFAULT '',
      updated_at BIGINT NOT NULL DEFAULT 0
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS referrals (
      referred_fid INTEGER PRIMARY KEY,
      referrer_fid INTEGER NOT NULL,
      created_at BIGINT NOT NULL DEFAULT 0,
      created_day TEXT NOT NULL DEFAULT ''
    )
  `;

  await sql`ALTER TABLE player_streaks ADD COLUMN IF NOT EXISTS streak_days INTEGER NOT NULL DEFAULT 0`;
  await sql`ALTER TABLE player_streaks ADD COLUMN IF NOT EXISTS last_play_day TEXT NOT NULL DEFAULT ''`;
  await sql`ALTER TABLE player_streaks ADD COLUMN IF NOT EXISTS updated_at BIGINT NOT NULL DEFAULT 0`;

  await sql`ALTER TABLE referrals ADD COLUMN IF NOT EXISTS referrer_fid INTEGER NOT NULL DEFAULT 0`;
  await sql`ALTER TABLE referrals ADD COLUMN IF NOT EXISTS created_at BIGINT NOT NULL DEFAULT 0`;
  await sql`ALTER TABLE referrals ADD COLUMN IF NOT EXISTS created_day TEXT NOT NULL DEFAULT ''`;

  await sql`CREATE INDEX IF NOT EXISTS referrals_referrer_idx ON referrals (referrer_fid, created_at DESC)`;

  rewardTablesEnsured = true;
}

export type WalletIdentity = {
  fid: number;
  walletAddress: string;
  username: string;
  displayName: string;
  pfpUrl: string;
};

function defaultWalletUsername(walletAddress: string): string {
  return `wallet_${walletAddress.slice(2, 8)}`;
}

function defaultWalletDisplayName(walletAddress: string): string {
  return `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`;
}

type NeynarUserPayload = {
  username?: string;
  display_name?: string;
  displayName?: string;
  pfp_url?: string;
  pfpUrl?: string;
};

function getMainnetRpcUrlForBasename(): string {
  return (
    process.env.ETH_MAINNET_RPC_URL?.trim() ||
    process.env.MAINNET_RPC_URL?.trim() ||
    process.env.ALCHEMY_MAINNET_RPC_URL?.trim() ||
    "https://eth.llamarpc.com"
  );
}

function getBasenameClient() {
  const rpcUrl = getMainnetRpcUrlForBasename();
  if (!basenameClient || basenameClientRpc !== rpcUrl) {
    basenameClient = createPublicClient({
      chain: mainnet,
      transport: http(rpcUrl),
    });
    basenameClientRpc = rpcUrl;
  }
  return basenameClient;
}

async function resolveBasenameByAddress(walletAddress: string): Promise<string | null> {
  const normalizedAddress = walletAddress.trim().toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(normalizedAddress)) return null;

  try {
    const client = getBasenameClient();
    const name = await client.getEnsName({
      address: normalizedAddress as Address,
      coinType: toCoinType(base.id),
    });
    if (!name || !name.toLowerCase().endsWith(".base.eth")) return null;
    return name;
  } catch {
    return null;
  }
}

function pickFirstNeynarUser(
  payload: unknown,
  normalizedAddress: string
): NeynarUserPayload | null {
  if (!payload || typeof payload !== "object") return null;
  const obj = payload as Record<string, unknown>;

  const addressCandidates = [
    normalizedAddress,
    normalizedAddress.toLowerCase(),
    normalizedAddress.toUpperCase(),
  ];
  for (const key of addressCandidates) {
    const entry = obj[key];
    if (Array.isArray(entry) && entry.length > 0 && entry[0] && typeof entry[0] === "object") {
      return entry[0] as NeynarUserPayload;
    }
  }

  if (obj.user && typeof obj.user === "object") {
    return obj.user as NeynarUserPayload;
  }

  if (Array.isArray(obj.users) && obj.users.length > 0 && obj.users[0] && typeof obj.users[0] === "object") {
    return obj.users[0] as NeynarUserPayload;
  }

  for (const value of Object.values(obj)) {
    if (Array.isArray(value) && value.length > 0 && value[0] && typeof value[0] === "object") {
      const candidate = value[0] as Record<string, unknown>;
      if (typeof candidate.username === "string" || typeof candidate.display_name === "string") {
        return candidate as NeynarUserPayload;
      }
    }
  }

  return null;
}

async function resolveWalletIdentityFromNeynar(
  walletAddress: string
): Promise<Pick<WalletIdentity, "username" | "displayName" | "pfpUrl"> | null> {
  const apiKey = process.env.NEYNAR_API_KEY?.trim();
  if (!apiKey) return null;

  const normalizedAddress = walletAddress.toLowerCase();
  const endpoints = [
    `https://api.neynar.com/v2/farcaster/user/bulk-by-address/?addresses=${encodeURIComponent(
      normalizedAddress
    )}&address_types=${encodeURIComponent("verified_address,custody_address")}`,
    `https://api.neynar.com/v2/farcaster/user/custody-address/?custody_address=${encodeURIComponent(
      normalizedAddress
    )}`,
  ];

  for (const endpoint of endpoints) {
    try {
      const res = await fetch(endpoint, {
        headers: {
          accept: "application/json",
          "x-api-key": apiKey,
        },
        cache: "no-store",
      });
      if (!res.ok) continue;

      const payload = (await res.json()) as unknown;
      const user = pickFirstNeynarUser(payload, normalizedAddress);
      if (!user) continue;

      const username = typeof user.username === "string" ? user.username.trim() : "";
      if (!username) continue;

      const displayNameRaw =
        (typeof user.display_name === "string" ? user.display_name : "") ||
        (typeof user.displayName === "string" ? user.displayName : "");
      const displayName = displayNameRaw.trim() || username;
      const pfpUrlRaw =
        (typeof user.pfp_url === "string" ? user.pfp_url : "") ||
        (typeof user.pfpUrl === "string" ? user.pfpUrl : "");

      return {
        username,
        displayName,
        pfpUrl: pfpUrlRaw.trim(),
      };
    } catch {
      // Try next Neynar endpoint.
    }
  }

  return null;
}

export async function ensureWalletIdentityTable(sql: NeonSql) {
  if (walletIdentitiesEnsured) return;

  await sql`CREATE SEQUENCE IF NOT EXISTS wallet_fid_seq START WITH 1500000000`;

  await sql`
    CREATE TABLE IF NOT EXISTS wallet_identities (
      wallet_address TEXT PRIMARY KEY,
      fid INTEGER UNIQUE NOT NULL DEFAULT nextval('wallet_fid_seq'),
      username TEXT NOT NULL DEFAULT '',
      display_name TEXT NOT NULL DEFAULT '',
      pfp_url TEXT NOT NULL DEFAULT '',
      created_at BIGINT NOT NULL DEFAULT 0,
      updated_at BIGINT NOT NULL DEFAULT 0
    )
  `;

  await sql`ALTER TABLE wallet_identities ADD COLUMN IF NOT EXISTS fid INTEGER`;
  await sql`ALTER TABLE wallet_identities ALTER COLUMN fid SET DEFAULT nextval('wallet_fid_seq')`;
  await sql`ALTER TABLE wallet_identities ADD COLUMN IF NOT EXISTS username TEXT NOT NULL DEFAULT ''`;
  await sql`ALTER TABLE wallet_identities ADD COLUMN IF NOT EXISTS display_name TEXT NOT NULL DEFAULT ''`;
  await sql`ALTER TABLE wallet_identities ADD COLUMN IF NOT EXISTS pfp_url TEXT NOT NULL DEFAULT ''`;
  await sql`ALTER TABLE wallet_identities ADD COLUMN IF NOT EXISTS created_at BIGINT NOT NULL DEFAULT 0`;
  await sql`ALTER TABLE wallet_identities ADD COLUMN IF NOT EXISTS updated_at BIGINT NOT NULL DEFAULT 0`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS wallet_identities_fid_idx ON wallet_identities (fid)`;

  walletIdentitiesEnsured = true;
}

export async function getOrCreateWalletIdentity(
  sql: NeonSql,
  walletAddress: string
): Promise<WalletIdentity> {
  await ensureWalletIdentityTable(sql);

  const normalizedAddress = walletAddress.trim().toLowerCase();
  const now = Date.now();
  const username = defaultWalletUsername(normalizedAddress);
  const displayName = defaultWalletDisplayName(normalizedAddress);

  const rows = (await sql`
    INSERT INTO wallet_identities
      (wallet_address, username, display_name, pfp_url, created_at, updated_at)
    VALUES
      (${normalizedAddress}, ${username}, ${displayName}, '', ${now}, ${now})
    ON CONFLICT (wallet_address) DO UPDATE SET
      updated_at = ${now}
    RETURNING fid, wallet_address, username, display_name, pfp_url
  `) as Array<{
    fid: number;
    wallet_address: string;
    username: string;
    display_name: string;
    pfp_url: string;
  }>;

  let row = rows[0];
  if (!row || !Number.isInteger(Number(row.fid))) {
    throw new Error("Failed to resolve wallet identity");
  }

  const currentUsername = row.username || username;
  const currentDisplayName = row.display_name || displayName;
  const shouldAttemptProfileHydration =
    !row.pfp_url ||
    currentUsername.startsWith("wallet_") ||
    currentDisplayName.includes("...");

  if (shouldAttemptProfileHydration) {
    const basename = await resolveBasenameByAddress(normalizedAddress);
    const neynarProfile = await resolveWalletIdentityFromNeynar(normalizedAddress);
    const resolvedUsername =
      basename || neynarProfile?.username || currentUsername;
    const resolvedDisplayName =
      basename || neynarProfile?.displayName || currentDisplayName;
    const resolvedPfpUrl = neynarProfile?.pfpUrl || row.pfp_url || "";

    const didChange =
      resolvedUsername !== currentUsername ||
      resolvedDisplayName !== currentDisplayName ||
      resolvedPfpUrl !== (row.pfp_url || "");

    if (didChange) {
      const updatedRows = (await sql`
        UPDATE wallet_identities
        SET
          username = ${resolvedUsername},
          display_name = ${resolvedDisplayName},
          pfp_url = ${resolvedPfpUrl},
          updated_at = ${now}
        WHERE wallet_address = ${normalizedAddress}
        RETURNING fid, wallet_address, username, display_name, pfp_url
      `) as Array<{
        fid: number;
        wallet_address: string;
        username: string;
        display_name: string;
        pfp_url: string;
      }>;
      if (updatedRows[0]) {
        row = updatedRows[0];
      }
    }
  }

  return {
    fid: Number(row.fid),
    walletAddress: row.wallet_address,
    username: row.username || username,
    displayName: row.display_name || displayName,
    pfpUrl: row.pfp_url || "",
  };
}
