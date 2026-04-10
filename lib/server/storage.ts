import { neon } from "@neondatabase/serverless";

export type NeonSql = ReturnType<typeof neon>;

let scoresEnsured = false;
let notificationEnsured = false;
let rewardTablesEnsured = false;
let walletIdentitiesEnsured = false;

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

  const row = rows[0];
  if (!row || !Number.isInteger(Number(row.fid))) {
    throw new Error("Failed to resolve wallet identity");
  }

  return {
    fid: Number(row.fid),
    walletAddress: row.wallet_address,
    username: row.username || username,
    displayName: row.display_name || displayName,
    pfpUrl: row.pfp_url || "",
  };
}
