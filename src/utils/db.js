/**
 * db.js — Central SQLite database initializer
 *
 * Creates/opens data/bot.db and defines ALL tables in one place.
 * Every store imports `db` from here — no store opens its own connection.
 *
 * Tables:
 *   guild_config   — per-guild settings (setup + auto-wave)
 *   auto_wave      — auto-wave cooldown timestamps
 *   waves          — user partner-ad waves (ads stored as JSON array)
 *   partner_links  — partner link tracking per user
 *   partner_daily  — daily link records (child of partner_links)
 *   tickets        — open ticket channels
 *   ticket_configs — per-guild ticket panel config
 *   giveaways      — active giveaways
 */

const Database = require('better-sqlite3');
const path     = require('path');
const fs       = require('fs');

const DB_DIR  = path.join(__dirname, '../../data');
const DB_PATH = path.join(DB_DIR, 'bot.db');

fs.mkdirSync(DB_DIR, { recursive: true });

const db = new Database(DB_PATH);

// Enable WAL mode for much better concurrent read performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ─── Schema ──────────────────────────────────────────────────────────────────

db.exec(`
  -- Per-guild configuration (setup + auto-wave merged)
  CREATE TABLE IF NOT EXISTS guild_config (
    guild_id            TEXT PRIMARY KEY,
    welcome_channel_id  TEXT,
    welcome_message     TEXT,
    autorole_id         TEXT,
    partner_channel_id  TEXT,
    ad_channel_id       TEXT,
    log_channel_id      TEXT,
    member_role_id      TEXT,
    partner_ping_role_id TEXT,
    partner_delay_hours  INTEGER DEFAULT 24
  );

  -- Auto-wave cooldown tracking
  CREATE TABLE IF NOT EXISTS auto_wave (
    guild_id          TEXT PRIMARY KEY,
    last_received_at  INTEGER NOT NULL DEFAULT 0
  );

  -- User partner-ad waves
  CREATE TABLE IF NOT EXISTS waves (
    user_id      TEXT NOT NULL,
    name_key     TEXT NOT NULL,  -- lowercased display name (lookup key)
    display_name TEXT NOT NULL,
    ads          TEXT NOT NULL,  -- JSON array of ad strings
    updated_at   INTEGER NOT NULL,
    PRIMARY KEY (user_id, name_key)
  );

  -- Partner link tracking — per user totals
  CREATE TABLE IF NOT EXISTS partner_links (
    user_id        TEXT PRIMARY KEY,
    username       TEXT,
    total_partners INTEGER NOT NULL DEFAULT 0
  );

  -- Daily partner links — one row per user+date+link
  CREATE TABLE IF NOT EXISTS partner_daily (
    user_id  TEXT NOT NULL,
    date_key TEXT NOT NULL,  -- YYYY-MM-DD
    link     TEXT NOT NULL,
    PRIMARY KEY (user_id, date_key, link),
    FOREIGN KEY (user_id) REFERENCES partner_links(user_id) ON DELETE CASCADE
  );

  -- Open ticket channels
  CREATE TABLE IF NOT EXISTS tickets (
    channel_id TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL,
    guild_id   TEXT NOT NULL,
    number     INTEGER NOT NULL DEFAULT 0
  );

  -- Per-guild ticket panel config
  CREATE TABLE IF NOT EXISTS ticket_configs (
    guild_id    TEXT PRIMARY KEY,
    channel_id  TEXT,
    message_id  TEXT,
    category_id TEXT,
    staff_role_id TEXT
  );

  -- Active giveaways
  CREATE TABLE IF NOT EXISTS giveaways (
    message_id    TEXT PRIMARY KEY,
    channel_id    TEXT NOT NULL,
    guild_id      TEXT NOT NULL,
    prize         TEXT NOT NULL,
    description   TEXT,
    winners_count INTEGER NOT NULL DEFAULT 1,
    ends_at       INTEGER NOT NULL,
    host_id       TEXT NOT NULL
  );
`);

module.exports = db;
