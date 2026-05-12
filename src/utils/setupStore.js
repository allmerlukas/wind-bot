const fs = require('fs');
const path = require('path');
const DATA_FILE = path.join(__dirname, '../../data/setup.json');

function load() {
  if (!fs.existsSync(DATA_FILE)) {
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify({}));
    return {};
  }
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8')); }
  catch { return {}; }
}

function save(data) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function get(guildId) { return load()[guildId] ?? {}; }

function set(guildId, key, value) {
  const data = load();
  if (!data[guildId]) data[guildId] = {};
  data[guildId][key] = value;
  save(data);
}

module.exports = { get, set };
