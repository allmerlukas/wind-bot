/**
 * pairStore.js — Tracks which guilds have partnered recently + source queue (Supabase)
 */

const supabase = require('./supabase');

const PAIR_COOLDOWN_MS = 48 * 60 * 60 * 1000; // 2 days

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

module.exports = { recordPair, pairedRecently, PAIR_COOLDOWN_MS };
