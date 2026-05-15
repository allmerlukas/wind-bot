/**
 * errorStore.js — Persistent error logger
 *
 * Stores bot errors in the `bot_errors` SQLite table.
 * Keeps a rolling window of the last 200 errors (auto-prunes on insert).
 *
 * Usage:
 *   const { logError } = require('./errorStore');
 *   logError('AutoWave', err, guildId);
 */

const db = require('./db');

const MAX_ERRORS = 200;

const stmtInsert = db.prepare(`
  INSERT INTO bot_errors (occurred_at, source, guild_id, message, stack)
  VALUES (?, ?, ?, ?, ?)
`);
const stmtPrune = db.prepare(`
  DELETE FROM bot_errors
  WHERE id NOT IN (
    SELECT id FROM bot_errors ORDER BY id DESC LIMIT ?
  )
`);
const stmtGetRecent = db.prepare(`
  SELECT * FROM bot_errors ORDER BY id DESC LIMIT ?
`);
const stmtCount = db.prepare('SELECT COUNT(*) AS cnt FROM bot_errors');

/**
 * Log an error to the database.
 * @param {string}      source   — where it came from (e.g. 'AutoWave', 'Command:/kick')
 * @param {Error|string} err     — the error object or message string
 * @param {string}      [guildId] — guild context if applicable
 */
function logError(source, err, guildId = null) {
  const message = err instanceof Error ? err.message : String(err);
  const stack   = err instanceof Error ? (err.stack ?? null) : null;

  stmtInsert.run(Date.now(), source, guildId, message, stack);
  stmtPrune.run(MAX_ERRORS);
}

/**
 * Fetch the most recent errors.
 * @param {number} limit — max number of errors to return (default 20)
 */
function getRecentErrors(limit = 20) {
  return stmtGetRecent.all(Math.min(limit, MAX_ERRORS));
}

/**
 * Total number of errors currently stored.
 */
function getErrorCount() {
  return stmtCount.get()?.cnt ?? 0;
}

module.exports = { logError, getRecentErrors, getErrorCount };
