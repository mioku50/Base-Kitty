import { neon } from "@neondatabase/serverless";

export type NeonSql = ReturnType<typeof neon>;

let scoresEnsured = false;
let notificationEnsured = false;

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
      last_played_at BIGINT NOT NULL DEFAULT 0
    )
  `;

  await sql`ALTER TABLE scores ADD COLUMN IF NOT EXISTS last_played_at BIGINT NOT NULL DEFAULT 0`;

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
