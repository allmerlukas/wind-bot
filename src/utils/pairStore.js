/**
 * pairStore.js — Tracks which guilds have partnered recently + source queue (Supabase)
 */

const supabase = require('./supabase');

const PAIR_COOLDOWN_MS = 72 * 60 * 60 * 1000; // 3 days

function pairKey(idA, idB) {
  return idA < idB ? [idA, idB] : [idB, idA];
}

async function recordPair(idA, idB) {
  const [a, b] = pairKey(idA, idB);
  await supabase.from('wave_pairs').upsert(
    { guild_a: a, guild_b: b, paired_at: Date.now() },
    { onConflict: 'guild_a,guild_b' }
  );
}

async function pairedRecently(idA, idB) {
  const [a, b] = pairKey(idA, idB);
  const { data } = await supabase
    .from('wave_pairs')
    .select('paired_at')
    .eq('guild_a', a)
    .eq('guild_b', b)
    .single();
  if (!data) return false;
  return Date.now() - data.paired_at < PAIR_COOLDOWN_MS;
}

// ─── Shuffled source queue ────────────────────────────────────────────────────

function _shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function _loadQueue() {
  const { data } = await supabase
    .from('wave_queue')
    .select('queue')
    .eq('id', 1)
    .single();
  if (!data) return [];
  try { return JSON.parse(data.queue); } catch { return []; }
}

async function _saveQueue(q) {
  await supabase.from('wave_queue').upsert(
    { id: 1, queue: JSON.stringify(q) },
    { onConflict: 'id' }
  );
}

async function nextSource(activeIds) {
  const activeSet = new Set(activeIds);
  let queue = (await _loadQueue()).filter(id => activeSet.has(id));

  if (queue.length === 0) {
    queue = _shuffle(activeIds);
  }

  const source = queue.shift();
  await _saveQueue(queue);
  return source;
}

module.exports = { recordPair, pairedRecently, nextSource, PAIR_COOLDOWN_MS };
