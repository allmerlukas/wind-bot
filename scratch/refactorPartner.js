const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '../src/commands/partner.js');
let code = fs.readFileSync(file, 'utf8');

// Replace findEligiblePair
const newFindEligiblePair = `
async function findEligiblePair(userId, userGuilds) {
  // Fetch all recent pairs for this user in bulk!
  const recentPairs = await pmStore.getRecentPairsForUser(userId);
  const pairSet = new Set(recentPairs.map(p => \`\${p.guild_a}:\${p.guild_b}\`));

  for (const a of userGuilds) {
    if (!a.label) continue; // must have an ad
    for (const b of userGuilds) {
      if (a.guild_id === b.guild_id) continue;
      if (!b.read_channel_id) continue; // b must be able to receive
      
      const key1 = \`\${a.guild_id}:\${b.guild_id}\`;
      const key2 = \`\${b.guild_id}:\${a.guild_id}\`;
      
      if (!pairSet.has(key1) && !pairSet.has(key2)) {
        return { sender: a, receiver: b };
      }
    }
  }
  return null;
}
`;

code = code.replace(
  /async function findEligiblePair\(userId, userGuilds\) \{[\s\S]*?\n\}/,
  newFindEligiblePair.trim()
);

fs.writeFileSync(file, code);
console.log("Refactored partner.js");
