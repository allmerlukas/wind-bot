/**
 * setupStore.js — Guild configuration store (SQLite)
 *
 * Replaces the old flat JSON file at data/setup.json.
 * Preserves the same get(guildId) / set(guildId, key, value) API
 * so no other files need to change.
 *
 * Column mapping (camelCase key → snake_case column):
 *   welcomeChannelId    → welcome_channel_id
 *   welcomeMessage      → welcome_message
 *   autoroleId          → autorole_id
 *   partnerChannelId    → partner_channel_id
 *   adChannelId         → ad_channel_id
 *   logChannelId        → log_channel_id
 *   memberRoleId        → member_role_id
 *   partnerPingRoleId   → partner_ping_role_id
 *   partnerDelayHours   → partner_delay_hours
 */

const db = require('./db');

const KEY_MAP = {
  welcomeChannelId:  'welcome_channel_id',
  welcomeMessage:    'welcome_message',
  autoroleId:        'autorole_id',
  partnerChannelId:  'partner_channel_id',
  adChannelId:       'ad_channel_id',
  logChannelId:      'log_channel_id',
  memberRoleId:      'member_role_id',
  partnerPingRoleId: 'partner_ping_role_id',
  partnerDelayHours: 'partner_delay_hours',
};

// Reverse map: column → camelCase
const COL_MAP = Object.fromEntries(Object.entries(KEY_MAP).map(([k, v]) => [v, k]));

const COLUMNS = Object.values(KEY_MAP);

// ─── Prepared statements ─────────────────────────────────────────────────────

const stmtGet = db.prepare('SELECT * FROM guild_config WHERE guild_id = ?');

function ensureRow(guildId) {
  db.prepare(
    'INSERT OR IGNORE INTO guild_config (guild_id) VALUES (?)'
  ).run(guildId);
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Returns the full config object for a guild (camelCase keys).
 */
function get(guildId) {
  const row = stmtGet.get(guildId);
  if (!row) return {};
  const out = {};
  for (const col of COLUMNS) {
    const camel = COL_MAP[col];
    if (row[col] !== null && row[col] !== undefined) out[camel] = row[col];
  }
  return out;
}

/**
 * Sets a single config key for a guild.
 * @param {string} guildId
 * @param {string} key   camelCase key (e.g. 'welcomeChannelId')
 * @param {*}      value
 */
function set(guildId, key, value) {
  const col = KEY_MAP[key];
  if (!col) throw new Error(`setupStore: unknown key "${key}"`);
  ensureRow(guildId);
  db.prepare(`UPDATE guild_config SET ${col} = ? WHERE guild_id = ?`).run(value, guildId);
}

module.exports = { get, set };
