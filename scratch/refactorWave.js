const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '../src/utils/autoWaveEngine.js');
let code = fs.readFileSync(file, 'utf8');

// Imports
code = code.replace(
  "const autoWaveStore = require('./autoWaveStore');",
  "const autoWaveStore = require('./autoWaveStore');\nconst { getAllBlacklisted } = require('./blacklistStore');\nconst { getRecentPairsAll } = require('./pairStore');"
);

// We need to rewrite `validateGuild` to take `blacklistedSet` instead of calling `isBlacklisted(guildId)`.
// async function validateGuild(guildId, guild, cfg)
code = code.replace(
  "async function validateGuild(guildId, guild, cfg) {",
  "async function validateGuild(guildId, guild, cfg, blacklistedSet) {"
);
code = code.replace(
  "if (await isBlacklisted(guildId))  return 'blacklisted';",
  "if (blacklistedSet.has(guildId))  return 'blacklisted';"
);

// We need to rewrite `tick` function.
/*
Old tick:
async function tick(client) {
  if (!engineRunning) return;

  try {
    const now = Date.now();
    const readyGuilds = [];

    // 1. Collect all guilds passing runtime validation ─────────────────────────
    for (const [guildId, guild] of client.guilds.cache) {
      const cfg    = await setupStore.get(guildId);
      const reason = await validateGuild(guildId, guild, cfg);
...
      // Check per-server cooldown
      const delayMs = (cfg.partnerDelayHours ?? 24) * 60 * 60 * 1000;
      const lastReceived = await autoWaveStore.getLastReceived(guildId);
*/
// The new tick needs to fetch all beforehand.
const newTickStart = `
async function tick(client) {
  if (!engineRunning) return;

  try {
    const now = Date.now();
    
    // Bulk fetch everything
    const allCfgsArr = await setupStore.getAll();
    const cfgMap = new Map();
    for (const c of allCfgsArr) cfgMap.set(c.guild_id, c);
    
    const allBlacklistedArr = await getAllBlacklisted();
    const blacklistedSet = new Set(allBlacklistedArr.map(b => b.guild_id));
    
    const allLastReceived = await autoWaveStore.getAllLastReceived();
    
    const allRecentPairs = await getRecentPairsAll();
    const recentPairSet = new Set(allRecentPairs.map(p => \`\${p.guild_a}:\${p.guild_b}\`));
    
    const readyGuilds = [];

    // 1. Collect all guilds passing runtime validation ─────────────────────────
    for (const [guildId, guild] of client.guilds.cache) {
      const cfg    = cfgMap.get(guildId) || {};
      const reason = await validateGuild(guildId, guild, cfg, blacklistedSet);
`;

code = code.replace(
  /async function tick\(client\) \{[\s\S]*?\/\/ 1\. Collect all guilds passing runtime validation ─────────────────────────\n    for \(const \[guildId, guild\] of client\.guilds\.cache\) \{\n      const cfg    = await setupStore\.get\(guildId\);\n      const reason = await validateGuild\(guildId, guild, cfg\);/,
  newTickStart
);

code = code.replace(
  "const lastReceived = await autoWaveStore.getLastReceived(guildId);",
  "const lastReceived = allLastReceived.get(guildId) ?? 0;"
);

// Fix pair checking inside tick
/*
Old:
          // Check if they were paired recently
          if (await pairedRecently(a.guildId, b.guildId)) continue;
*/
// New:
const newPairCheck = `
          // Check if they were paired recently
          const key1 = \`\${a.guildId}:\${b.guildId}\`;
          const key2 = \`\${b.guildId}:\${a.guildId}\`;
          if (recentPairSet.has(key1) || recentPairSet.has(key2)) continue;
`;
code = code.replace(
  "// Check if they were paired recently\n          if (await pairedRecently(a.guildId, b.guildId)) continue;",
  newPairCheck
);

// Fix Promise.allSettled at the end
/*
Old:
    // 5. Update last received timestamp for successful deliveries
    for (const id of successfulGuilds) {
      await autoWaveStore.setLastReceived(id);
    }
*/
const newSetLast = `    // 5. Update last received timestamp for successful deliveries
    await Promise.allSettled([...successfulGuilds].map(id => autoWaveStore.setLastReceived(id)));`;

code = code.replace(
  /\/\/ 5\. Update last received timestamp for successful deliveries\n    for \(const id of successfulGuilds\) \{\n      await autoWaveStore\.setLastReceived\(id\);\n    \}/,
  newSetLast
);

fs.writeFileSync(file, code);
console.log("Refactored autoWaveEngine");
