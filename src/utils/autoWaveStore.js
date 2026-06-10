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

module.exports = { getLastReceived, setLastReceived };
