/**
 * autoWaveStore.js — Auto-wave cooldown store (SQLite)
 *
 * Replaces data/autowave.json.
 * Tracks when each guild last received a partner ad + round-robin index.
 */

const db = require('./db');

const stmtGet = db.prepare('SELECT last_received_at FROM auto_wave WHERE guild_id = ?');
const stmtSet = db.prepare(`
  INSERT INTO auto_wave (guild_id, last_received_at)
  VALUES (?, ?)
  ON CONFLICT(guild_id) DO UPDATE SET last_received_at = excluded.last_received_at
`);

/**
 * Returns the timestamp (ms) of when this guild last received a partner ad.
 * Returns 0 if it has never received one.
 */
function getLastReceived(guildId) {
  return stmtGet.get(guildId)?.last_received_at ?? 0;
}

/**
 * Records that this guild just received a partner ad right now.
 */
function setLastReceived(guildId) {
  stmtSet.run(guildId, Date.now());
}

/**
 * Round-robin pointer — in memory only (resets on restart, fine for this use case).
 */
let _roundRobinIndex = 0;
function getRoundRobinIndex() { return _roundRobinIndex; }
function advanceRoundRobin(total) {
  _roundRobinIndex = (_roundRobinIndex + 1) % Math.max(total, 1);
}

module.exports = { getLastReceived, setLastReceived, getRoundRobinIndex, advanceRoundRobin };
