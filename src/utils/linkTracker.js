/**
 * linkTracker.js — Partner link tracking store (SQLite)
 *
 * Replaces data/partners.json.
 * Uses two tables:
 *   partner_links  — total count per user
 *   partner_daily  — individual link records per user/date (for deduplication)
 *
 * Daily records older than 30 days are pruned on each addLinks call.
 */

const db = require('./db');

// ─── Utilities ────────────────────────────────────────────────────────────────

function getTodayKey() {
  const now = new Date();
  const y   = now.getFullYear();
  const m   = String(now.getMonth() + 1).padStart(2, '0');
  const d   = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function extractLinks(content) {
  const urlRegex = /https?:\/\/[^\s<>")\]]+/gi;
  const matches  = content.match(urlRegex) || [];
  const normalized = matches.map(url => url.replace(/[.,;!?'"]+$/, '').toLowerCase());
  return [...new Set(normalized)];
}

// ─── Prepared statements ─────────────────────────────────────────────────────

const stmtEnsureUser = db.prepare(`
  INSERT OR IGNORE INTO partner_links (user_id, username, total_partners)
  VALUES (?, ?, 0)
`);
const stmtUpdateUsername = db.prepare(
  'UPDATE partner_links SET username = ? WHERE user_id = ?'
);
const stmtIncrTotal = db.prepare(
  'UPDATE partner_links SET total_partners = total_partners + 1 WHERE user_id = ?'
);
const stmtGetUser = db.prepare(
  'SELECT * FROM partner_links WHERE user_id = ?'
);
const stmtGetAll = db.prepare(
  'SELECT * FROM partner_links ORDER BY total_partners DESC'
);
const stmtCheckLink = db.prepare(
  'SELECT 1 FROM partner_daily WHERE user_id = ? AND date_key = ? AND link = ?'
);
const stmtInsertLink = db.prepare(
  'INSERT OR IGNORE INTO partner_daily (user_id, date_key, link) VALUES (?, ?, ?)'
);
const stmtPruneOldDays = db.prepare(`
  DELETE FROM partner_daily
  WHERE user_id = ? AND date_key < date('now', '-30 days')
`);

// ─── Core Logic ───────────────────────────────────────────────────────────────

/**
 * Tries to add links for a user. Skips links already posted today.
 * @returns {{ newLinksAdded: number, totalPartners: number }}
 */
function addLinks(userId, username, links) {
  const today = getTodayKey();

  stmtEnsureUser.run(userId, username);
  stmtUpdateUsername.run(username, userId);

  let newLinksAdded = 0;

  const addOne = db.transaction((link) => {
    const alreadyPosted = stmtCheckLink.get(userId, today, link);
    if (!alreadyPosted) {
      stmtInsertLink.run(userId, today, link);
      stmtIncrTotal.run(userId);
      newLinksAdded++;
    }
  });

  for (const link of links) addOne(link);

  // Prune old daily records (keep last 30 days)
  stmtPruneOldDays.run(userId);

  const row = stmtGetUser.get(userId);
  return { newLinksAdded, totalPartners: row?.total_partners ?? 0 };
}

function getPartners(userId) {
  const row = stmtGetUser.get(userId);
  if (!row) return { totalPartners: 0, username: null };
  return { totalPartners: row.total_partners, username: row.username };
}

function getAllPartners() {
  const rows = stmtGetAll.all();
  const out  = {};
  for (const row of rows) {
    out[row.user_id] = {
      username:      row.username,
      totalPartners: row.total_partners,
    };
  }
  return out;
}

module.exports = { extractLinks, addLinks, getPartners, getAllPartners };
