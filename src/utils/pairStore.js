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

async function getRecentPairsAll() {
  const cutoff = Date.now() - PAIR_COOLDOWN_MS;
  const { data } = await supabase
    .from('wave_pairs')
    .select('guild_a, guild_b')
    .gt('paired_at', cutoff);
  return data || [];
}

async function getRecentPairsForGuild(guildId) {
  const cutoff = Date.now() - PAIR_COOLDOWN_MS;
  const { data } = await supabase
    .from('wave_pairs')
    .select('guild_a, guild_b')
    .gt('paired_at', cutoff)
    .or(`guild_a.eq.${guildId},guild_b.eq.${guildId}`);
  return data || [];
}

module.exports = { recordPair, pairedRecently, getRecentPairsAll, getRecentPairsForGuild, PAIR_COOLDOWN_MS };
