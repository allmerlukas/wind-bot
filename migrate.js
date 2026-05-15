/**
 * migrate.js — One-time migration from JSON files to SQLite
 *
 * Run ONCE before restarting the bot:
 *   node migrate.js
 *
 * Safe to run multiple times — uses INSERT OR IGNORE / INSERT OR REPLACE.
 * Old JSON files are renamed to *.json.bak after migration.
 */

require('dotenv').config();
const fs   = require('fs');
const path = require('path');

// Boot the DB (creates tables if needed)
const db = require('./src/utils/db');

const DATA = path.join(__dirname, 'data');

function loadJson(file, fallback) {
  const fp = path.join(DATA, file);
  if (!fs.existsSync(fp)) return fallback;
  try   { return JSON.parse(fs.readFileSync(fp, 'utf-8')); }
  catch { return fallback; }
}

function backup(file) {
  const fp  = path.join(DATA, file);
  const bak = fp + '.bak';
  if (fs.existsSync(fp)) fs.renameSync(fp, bak);
}

let total = 0;

// ─── 1. setup.json → guild_config ────────────────────────────────────────────
console.log('\n📦 Migrating setup.json...');
const setup = loadJson('setup.json', {});
const setupStmt = db.prepare(`
  INSERT OR REPLACE INTO guild_config
    (guild_id, welcome_channel_id, welcome_message, autorole_id,
     partner_channel_id, ad_channel_id, log_channel_id,
     member_role_id, partner_ping_role_id, partner_delay_hours)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
for (const [guildId, cfg] of Object.entries(setup)) {
  setupStmt.run(
    guildId,
    cfg.welcomeChannelId   ?? null,
    cfg.welcomeMessage     ?? null,
    cfg.autoroleId         ?? null,
    cfg.partnerChannelId   ?? null,
    cfg.adChannelId        ?? null,
    cfg.logChannelId       ?? null,
    cfg.memberRoleId       ?? null,
    cfg.partnerPingRoleId  ?? null,
    cfg.partnerDelayHours  ?? 24,
  );
  total++;
}
console.log(`  ✅ ${Object.keys(setup).length} guilds migrated`);
backup('setup.json');

// ─── 2. autowave.json → auto_wave ────────────────────────────────────────────
console.log('📦 Migrating autowave.json...');
const aw = loadJson('autowave.json', {});
const awStmt = db.prepare(`
  INSERT OR REPLACE INTO auto_wave (guild_id, last_received_at)
  VALUES (?, ?)
`);
for (const [guildId, data] of Object.entries(aw)) {
  awStmt.run(guildId, data.lastReceivedAt ?? 0);
  total++;
}
console.log(`  ✅ ${Object.keys(aw).length} cooldown records migrated`);
backup('autowave.json');

// ─── 3. waves.json → waves ───────────────────────────────────────────────────
console.log('📦 Migrating waves.json...');
const waves = loadJson('waves.json', {});
const waveStmt = db.prepare(`
  INSERT OR REPLACE INTO waves (user_id, name_key, display_name, ads, updated_at)
  VALUES (?, ?, ?, ?, ?)
`);
let waveCount = 0;
for (const [userId, userWaves] of Object.entries(waves)) {
  for (const [nameKey, wave] of Object.entries(userWaves)) {
    waveStmt.run(userId, nameKey, wave.displayName, JSON.stringify(wave.ads), wave.updatedAt ?? Date.now());
    waveCount++;
    total++;
  }
}
console.log(`  ✅ ${waveCount} waves migrated`);
backup('waves.json');

// ─── 4. partners.json → partner_links + partner_daily ────────────────────────
console.log('📦 Migrating partners.json...');
const partners = loadJson('partners.json', {});
const plStmt = db.prepare(`
  INSERT OR REPLACE INTO partner_links (user_id, username, total_partners)
  VALUES (?, ?, ?)
`);
const pdStmt = db.prepare(`
  INSERT OR IGNORE INTO partner_daily (user_id, date_key, link)
  VALUES (?, ?, ?)
`);
let partnerCount = 0;
for (const [userId, data] of Object.entries(partners)) {
  plStmt.run(userId, data.username ?? null, data.totalPartners ?? 0);
  for (const [dateKey, links] of Object.entries(data.dailyLinks ?? {})) {
    for (const link of links) {
      pdStmt.run(userId, dateKey, link);
    }
  }
  partnerCount++;
  total++;
}
console.log(`  ✅ ${partnerCount} partner users migrated`);
backup('partners.json');

// ─── 5. tickets.json → tickets + ticket_configs ──────────────────────────────
console.log('📦 Migrating tickets.json...');
const tickets = loadJson('tickets.json', { configs: {}, tickets: {} });
const tcStmt = db.prepare(`
  INSERT OR REPLACE INTO ticket_configs (guild_id, channel_id, message_id, category_id, staff_role_id)
  VALUES (?, ?, ?, ?, ?)
`);
const tStmt = db.prepare(`
  INSERT OR REPLACE INTO tickets (channel_id, user_id, guild_id, number)
  VALUES (?, ?, ?, ?)
`);
for (const [guildId, cfg] of Object.entries(tickets.configs ?? {})) {
  tcStmt.run(guildId, cfg.channelId ?? null, cfg.messageId ?? null, cfg.categoryId ?? null, cfg.staffRoleId ?? null);
  total++;
}
for (const [channelId, t] of Object.entries(tickets.tickets ?? {})) {
  tStmt.run(channelId, t.userId, t.guildId, t.number ?? 0);
  total++;
}
console.log(`  ✅ ${Object.keys(tickets.configs ?? {}).length} ticket configs + ${Object.keys(tickets.tickets ?? {}).length} open tickets migrated`);
backup('tickets.json');

// ─── 6. giveaways.json → giveaways ───────────────────────────────────────────
console.log('📦 Migrating giveaways.json...');
const giveaways = loadJson('giveaways.json', []);
const gaStmt = db.prepare(`
  INSERT OR REPLACE INTO giveaways
    (message_id, channel_id, guild_id, prize, description, winners_count, ends_at, host_id)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);
for (const g of giveaways) {
  gaStmt.run(
    g.messageId, g.channelId, g.guildId ?? null,
    g.prize, g.description ?? null,
    g.winnersCount, g.endsAt, g.hostId,
  );
  total++;
}
console.log(`  ✅ ${giveaways.length} giveaways migrated`);
backup('giveaways.json');

// ─── Done ─────────────────────────────────────────────────────────────────────
console.log(`\n🎉 Migration complete! ${total} records written to data/bot.db`);
console.log(`📁 Old JSON files renamed to *.json.bak (safe to delete once you've verified)\n`);
