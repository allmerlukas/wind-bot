const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '../../data/waves.json');

function loadData() {
  if (!fs.existsSync(DATA_FILE)) {
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify({}));
    return {};
  }
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8')); }
  catch { return {}; }
}

function saveData(data) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function saveWave(userId, name, ads) {
  const data = loadData();
  if (!data[userId]) data[userId] = {};
  data[userId][name.toLowerCase()] = { displayName: name, ads, updatedAt: Date.now() };
  saveData(data);
}

function getWave(userId, name) {
  const data = loadData();
  return data[userId]?.[name.toLowerCase()] ?? null;
}

function getUserWaves(userId) {
  return loadData()[userId] ?? {};
}

function deleteWave(userId, name) {
  const data = loadData();
  if (!data[userId]?.[name.toLowerCase()]) return false;
  delete data[userId][name.toLowerCase()];
  saveData(data);
  return true;
}

function renameWave(userId, oldName, newName) {
  const data = loadData();
  const wave = data[userId]?.[oldName.toLowerCase()];
  if (!wave) return false;
  wave.displayName = newName;
  data[userId][newName.toLowerCase()] = wave;
  if (oldName.toLowerCase() !== newName.toLowerCase()) {
    delete data[userId][oldName.toLowerCase()];
  }
  saveData(data);
  return true;
}

function updateAd(userId, waveName, serverIndex, newAd) {
  const data = loadData();
  const wave = data[userId]?.[waveName.toLowerCase()];
  if (!wave || serverIndex < 0 || serverIndex >= wave.ads.length) return false;
  wave.ads[serverIndex] = newAd;
  wave.updatedAt = Date.now();
  saveData(data);
  return true;
}

function insertAd(userId, waveName, spliceIndex, newAd) {
  const data = loadData();
  const wave = data[userId]?.[waveName.toLowerCase()];
  if (!wave) return false;
  wave.ads.splice(spliceIndex, 0, newAd);
  wave.updatedAt = Date.now();
  saveData(data);
  return true;
}

module.exports = { saveWave, getWave, getUserWaves, deleteWave, renameWave, updateAd, insertAd };
