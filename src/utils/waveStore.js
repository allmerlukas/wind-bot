/**
 * waveStore.js — User partner-ad wave store (Supabase)
 */

const supabase = require('./supabase');

function rowToWave(row) {
  if (!row) return null;
  return {
    displayName: row.display_name,
    ads:         JSON.parse(row.ads),
    updatedAt:   row.updated_at,
  };
}

async function saveWave(userId, name, ads) {
  await supabase.from('waves').upsert({
    user_id:      userId,
    name_key:     name.toLowerCase(),
    display_name: name,
    ads:          JSON.stringify(ads),
    updated_at:   Date.now(),
  }, { onConflict: 'user_id,name_key' });
}

async function getWave(userId, name) {
  const { data } = await supabase
    .from('waves')
    .select('*')
    .eq('user_id', userId)
    .eq('name_key', name.toLowerCase())
    .single();
  return rowToWave(data);
}

async function getUserWaves(userId) {
  const { data } = await supabase
    .from('waves')
    .select('*')
    .eq('user_id', userId);
  const out = {};
  for (const row of (data ?? [])) out[row.name_key] = rowToWave(row);
  return out;
}

async function deleteWave(userId, name) {
  const key = name.toLowerCase();
  const wave = await getWave(userId, key);
  if (!wave) return false;
  await supabase.from('waves').delete().eq('user_id', userId).eq('name_key', key);
  return true;
}

async function renameWave(userId, oldName, newName) {
  const oldKey = oldName.toLowerCase();
  const newKey = newName.toLowerCase();
  const wave   = await getWave(userId, oldKey);
  if (!wave) return false;

  await saveWave(userId, newName, wave.ads);
  if (oldKey !== newKey) {
    await supabase.from('waves').delete().eq('user_id', userId).eq('name_key', oldKey);
  }
  return true;
}

async function updateAd(userId, waveName, serverIndex, newAd) {
  const wave = await getWave(userId, waveName.toLowerCase());
  if (!wave || serverIndex < 0 || serverIndex >= wave.ads.length) return false;
  wave.ads[serverIndex] = newAd;
  await saveWave(userId, wave.displayName, wave.ads);
  return true;
}

async function insertAd(userId, waveName, spliceIndex, newAd) {
  const wave = await getWave(userId, waveName.toLowerCase());
  if (!wave) return false;
  wave.ads.splice(spliceIndex, 0, newAd);
  await saveWave(userId, wave.displayName, wave.ads);
  return true;
}

module.exports = { saveWave, getWave, getUserWaves, deleteWave, renameWave, updateAd, insertAd };
