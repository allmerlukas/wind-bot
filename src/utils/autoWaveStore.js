/**
 * autoWaveStore.js — Auto-wave cooldown tracking (Supabase)
 */

const supabase = require('./supabase');

async function getLastReceived(guildId) {
  const { data } = await supabase
    .from('auto_wave')
    .select('last_received_at')
    .eq('guild_id', guildId)
    .single();
  return data?.last_received_at ?? 0;
}

async function setLastReceived(guildId) {
  await supabase
    .from('auto_wave')
    .upsert({ guild_id: guildId, last_received_at: Date.now() }, { onConflict: 'guild_id' });
}

async function getAllLastReceived() {
  const { data } = await supabase.from('auto_wave').select('guild_id, last_received_at');
  const map = new Map();
  if (data) {
    for (const row of data) {
      map.set(row.guild_id, row.last_received_at);
    }
  }
  return map;
}

module.exports = { getLastReceived, setLastReceived, getAllLastReceived };
