/**
 * waveStore.js — User partner-ad wave store (SQLite)
 *
 * Replaces data/waves.json.
 * Ads are stored as a JSON-serialized TEXT column since SQLite has no array type.
 * All public functions are synchronous — better-sqlite3 is fully sync.
 */

const db = require('./db');

// ─── Prepared statements ─────────────────────────────────────────────────────

const stmtGet = db.prepare(
  'SELECT * FROM waves WHERE user_id = ? AND name_key = ?'
);
const stmtGetAll = db.prepare(
  'SELECT * FROM waves WHERE user_id = ?'
);
const stmtUpsert = db.prepare(`
  INSERT INTO waves (user_id, name_key, display_name, ads, updated_at)
  VALUES (?, ?, ?, ?, ?)
  ON CONFLICT(user_id, name_key) DO UPDATE SET
    display_name = excluded.display_name,
    ads          = excluded.ads,
    updated_at   = excluded.updated_at
`);
const stmtDelete = db.prepare(
  'DELETE FROM waves WHERE user_id = ? AND name_key = ?'
);
const stmtDeleteOldKey = db.prepare(
  'DELETE FROM waves WHERE user_id = ? AND name_key = ?'
);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function rowToWave(row) {
  if (!row) return null;
  return {
    displayName: row.display_name,
    ads:         JSON.parse(row.ads),
    updatedAt:   row.updated_at,
  };
}

// ─── Public API (same as old waveStore) ──────────────────────────────────────

function saveWave(userId, name, ads) {
  stmtUpsert.run(userId, name.toLowerCase(), name, JSON.stringify(ads), Date.now());
}

function getWave(userId, name) {
  return rowToWave(stmtGet.get(userId, name.toLowerCase()));
}

function getUserWaves(userId) {
  const rows = stmtGetAll.all(userId);
  const out  = {};
  for (const row of rows) out[row.name_key] = rowToWave(row);
  return out;
}

function deleteWave(userId, name) {
  const key    = name.toLowerCase();
  const exists = stmtGet.get(userId, key);
  if (!exists) return false;
  stmtDelete.run(userId, key);
  return true;
}

function renameWave(userId, oldName, newName) {
  const oldKey = oldName.toLowerCase();
  const newKey = newName.toLowerCase();
  const wave   = rowToWave(stmtGet.get(userId, oldKey));
  if (!wave) return false;

  // Upsert under new key
  stmtUpsert.run(userId, newKey, newName, JSON.stringify(wave.ads), Date.now());
  // Remove old key (only if different)
  if (oldKey !== newKey) stmtDeleteOldKey.run(userId, oldKey);
  return true;
}

function updateAd(userId, waveName, serverIndex, newAd) {
  const wave = rowToWave(stmtGet.get(userId, waveName.toLowerCase()));
  if (!wave || serverIndex < 0 || serverIndex >= wave.ads.length) return false;
  wave.ads[serverIndex] = newAd;
  stmtUpsert.run(userId, waveName.toLowerCase(), wave.displayName, JSON.stringify(wave.ads), Date.now());
  return true;
}

function insertAd(userId, waveName, spliceIndex, newAd) {
  const wave = rowToWave(stmtGet.get(userId, waveName.toLowerCase()));
  if (!wave) return false;
  wave.ads.splice(spliceIndex, 0, newAd);
  stmtUpsert.run(userId, waveName.toLowerCase(), wave.displayName, JSON.stringify(wave.ads), Date.now());
  return true;
}

module.exports = { saveWave, getWave, getUserWaves, deleteWave, renameWave, updateAd, insertAd };
