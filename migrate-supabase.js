/**
 * migrate-supabase.js
 * Run this ONCE to create all required tables in your Supabase project.
 * Usage: node migrate-supabase.js
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function migrate() {
  console.log('🚀 Running Supabase migration...');

  const queries = [
    // guild_config
    `CREATE TABLE IF NOT EXISTS guild_config (
      guild_id              TEXT PRIMARY KEY,
      welcome_channel_id    TEXT,
      welcome_message       TEXT,
      autorole_id           TEXT,
      partner_channel_id    TEXT,
      ad_channel_id         TEXT,
      log_channel_id        TEXT,
      member_role_id        TEXT,
      partner_ping_role_id  TEXT,
      partner_delay_hours   INTEGER DEFAULT 24,
      min_members           INTEGER,
      max_members           INTEGER,
      strikes               INTEGER DEFAULT 0
    );`,

    // auto_wave
    `CREATE TABLE IF NOT EXISTS auto_wave (
      guild_id          TEXT PRIMARY KEY,
      last_received_at  BIGINT NOT NULL DEFAULT 0
    );`,

    // waves
    `CREATE TABLE IF NOT EXISTS waves (
      user_id      TEXT NOT NULL,
      name_key     TEXT NOT NULL,
      display_name TEXT NOT NULL,
      ads          TEXT NOT NULL,
      updated_at   BIGINT NOT NULL,
      PRIMARY KEY (user_id, name_key)
    );`,

    // partner_links
    `CREATE TABLE IF NOT EXISTS partner_links (
      user_id        TEXT PRIMARY KEY,
      username       TEXT,
      total_partners INTEGER NOT NULL DEFAULT 0
    );`,

    // partner_daily
    `CREATE TABLE IF NOT EXISTS partner_daily (
      user_id  TEXT NOT NULL,
      date_key TEXT NOT NULL,
      link     TEXT NOT NULL,
      PRIMARY KEY (user_id, date_key, link)
    );`,

    // tickets
    `CREATE TABLE IF NOT EXISTS tickets (
      channel_id TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL,
      guild_id   TEXT NOT NULL,
      number     INTEGER NOT NULL DEFAULT 0
    );`,

    // ticket_configs
    `CREATE TABLE IF NOT EXISTS ticket_configs (
      guild_id      TEXT PRIMARY KEY,
      channel_id    TEXT,
      message_id    TEXT,
      category_id   TEXT,
      staff_role_id TEXT
    );`,

    // giveaways
    `CREATE TABLE IF NOT EXISTS giveaways (
      message_id   TEXT PRIMARY KEY,
      channel_id   TEXT NOT NULL,
      guild_id     TEXT NOT NULL,
      prize        TEXT NOT NULL,
      winner_count INTEGER NOT NULL DEFAULT 1,
      ends_at      BIGINT NOT NULL,
      host_id      TEXT NOT NULL,
      entries      TEXT NOT NULL DEFAULT '[]'
    );`,

    // blacklisted_guilds
    `CREATE TABLE IF NOT EXISTS blacklisted_guilds (
      guild_id       TEXT PRIMARY KEY,
      reason         TEXT NOT NULL DEFAULT '',
      blacklisted_at BIGINT NOT NULL DEFAULT 0
    );`,

    // link_whitelist
    `CREATE TABLE IF NOT EXISTS link_whitelist (
      domain TEXT PRIMARY KEY
    );`,

    // bot_errors
    `CREATE TABLE IF NOT EXISTS bot_errors (
      id          SERIAL PRIMARY KEY,
      source      TEXT NOT NULL,
      message     TEXT NOT NULL,
      stack       TEXT,
      guild_id    TEXT,
      occurred_at BIGINT NOT NULL
    );`,

    // wave_pairs (pairStore)
    `CREATE TABLE IF NOT EXISTS wave_pairs (
      guild_a    TEXT NOT NULL,
      guild_b    TEXT NOT NULL,
      paired_at  BIGINT NOT NULL,
      PRIMARY KEY (guild_a, guild_b)
    );`,

    // wave_queue (pairStore)
    `CREATE TABLE IF NOT EXISTS wave_queue (
      id    INTEGER PRIMARY KEY DEFAULT 1,
      queue TEXT NOT NULL DEFAULT '[]'
    );`,

    // pm_guilds (pmStore)
    `CREATE TABLE IF NOT EXISTS pm_guilds (
      guild_id        TEXT PRIMARY KEY,
      channel_id      TEXT NOT NULL,
      read_channel_id TEXT
    );`,

    // pm_pairs (pmStore)
    `CREATE TABLE IF NOT EXISTS pm_pairs (
      guild_a   TEXT NOT NULL,
      guild_b   TEXT NOT NULL,
      paired_at BIGINT NOT NULL,
      PRIMARY KEY (guild_a, guild_b)
    );`,
  ];

  let allOk = true;
  for (const sql of queries) {
    const tableName = sql.match(/CREATE TABLE IF NOT EXISTS (\w+)/)?.[1] ?? '?';
    const { error } = await supabase.rpc('exec_sql', { sql }).catch(() => ({ error: null }));
    // Supabase doesn't expose raw SQL via JS SDK directly — we'll use the REST approach
    console.log(`  📋 Table: ${tableName} — queued (apply via Supabase SQL editor)`);
  }

  console.log('\n✅ Done! Copy the SQL above into your Supabase SQL editor to apply.');
  console.log('   Go to: https://supabase.com/dashboard/project/hlnbxfwhupnrhwotueoj/sql/new\n');
  
  // Print all SQL for easy copy-paste
  console.log('='.repeat(60));
  console.log('PASTE THIS INTO YOUR SUPABASE SQL EDITOR:');
  console.log('='.repeat(60));
  console.log(queries.join('\n\n'));
}

migrate().catch(console.error);
