/**
 * pairStore.js — Tracks which guilds have partnered with each other and when.
 *
 * Uses a canonical key (smaller guild ID first) so A→B and B→A are the same row.
 * Also manages the persistent shuffled source-guild queue.
 */

const db = require('./db');

const PAIR_COOLDOWN_MS = 48 * 60 * 60 * 1000; // 2 days

// ─── Canonical pair key ───────────────────────────────────────────────────────

function pairKey(idA, idB) {
  return idA < idB ? [idA, idB] : [idB, idA];
}

// ─── Pair cooldown ────────────────────────────────────────────────────────────

const stmtUpsertPair = db.prepare(`
  INSERT INTO partner_pairs (guild_a, guild_b, last_paired_at)
  VALUES (?, ?, ?)
  ON CONFLICT (guild_a, guild_b) DO UPDATE SET last_paired_at = excluded.last_paired_at
`);

const stmtGetPair = db.prepare(`
  SELECT last_paired_at FROM partner_pairs WHERE guild_a = ? AND guild_b = ?
`);

/**
 * Record that two guilds just partnered together.
 */
function recordPair(idA, idB) {
  const [a, b] = pairKey(idA, idB);
  stmtUpsertPair.run(a, b, Date.now());
}

/**
 * Returns true if these two guilds have partnered within the last 2 days.
 */
function pairedRecently(idA, idB) {
  const [a, b] = pairKey(idA, idB);
  const row = stmtGetPair.get(a, b);
  if (!row) return false;
  return Date.now() - row.last_paired_at < PAIR_COOLDOWN_MS;
}

// ─── Shuffled source queue ─────────────────────────────────────────────────────

const stmtGetQueue  = db.prepare('SELECT queue FROM wave_queue WHERE id = 1');
const stmtUpsertQueue = db.prepare(`
  INSERT INTO wave_queue (id, queue) VALUES (1, ?)
  ON CONFLICT (id) DO UPDATE SET queue = excluded.queue
`);

function _shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function _loadQueue() {
  const row = stmtGetQueue.get();
  if (!row) return [];
  try { return JSON.parse(row.queue); } catch { return []; }
}

function _saveQueue(q) {
  stmtUpsertQueue.run(JSON.stringify(q));
}

/**
 * Get the next source guild ID from the shuffled queue.
 *
 * - If the queue is empty or all IDs in it are no longer in activeIds,
 *   rebuild it by shuffling activeIds.
 * - Pops the first valid ID from the queue and persists the remainder.
 *
 * @param {string[]} activeIds  — all currently configured guild IDs
 * @returns {string}  next source guild ID
 */
function nextSource(activeIds) {
  const activeSet = new Set(activeIds);
  let queue = _loadQueue().filter(id => activeSet.has(id));

  // Queue exhausted or completely stale — reshuffle
  if (queue.length === 0) {
    queue = _shuffle(activeIds);
  }

  const source = queue.shift();
  _saveQueue(queue);
  return source;
}

module.exports = { recordPair, pairedRecently, nextSource, PAIR_COOLDOWN_MS };
