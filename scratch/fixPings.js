const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '../src/utils/autoWaveEngine.js');
let code = fs.readFileSync(file, 'utf8');

const oldResolvePing = `async function resolvePing(sourceGuild, targetGuild, targetCfg) {
  // Check global ping kill-switch (set via /owner ping on/off)
  const globalCfg = await setupStore.get('global');
  if (globalCfg?.pingEnabled === false) {
    return { ping: null, allowedMentions: { parse: [] } };
  }

  // Ping disabled for this specific server
  if (targetCfg.pingEnabled === false) {
    return { ping: null, allowedMentions: { parse: [] } };
  }

  const n     = targetGuild.memberCount;      // receiving server size
  const m     = sourceGuild.memberCount;      // sending server size
  const ratio = m / Math.max(n, 1);          // how big is sender relative to receiver

  // Level: 0=nothing, 1=partner ping, 2=@here, 3=partner+@here, 4=member role
  let level;

  if (n >= 500) {
    if      (ratio >= 0.92) level = 4;
    else if (ratio >= 0.71) level = 3;
    else if (ratio >= 0.51) level = 2;
    else if (ratio >= 0.38) level = 1;
    else                    level = 0;
  } else if (n >= 200) {
    if      (ratio >= 0.90) level = 4;
    else if (ratio >= 0.60) level = 3;
    else if (ratio >= 0.40) level = 2;
    else if (ratio >= 0.20) level = 1;
    else                    level = 0;
  } else if (n >= 50) {
    if      (ratio >= 0.85) level = 4;
    else if (ratio >= 0.50) level = 2;
    else                    level = 1;
  } else {
    // Small server (< 50)
    level = ratio >= 0.85 ? 4 : 1;
  }

  if (level === 0) return { ping: null, allowedMentions: { parse: [] } };

  const partnerRole = targetCfg.partnerPingRoleId
    ? targetGuild.roles.cache.get(targetCfg.partnerPingRoleId) : null;
  const memberRole = targetCfg.memberRoleId
    ? targetGuild.roles.cache.get(targetCfg.memberRoleId) : null;

  if (level === 1) {
    if (partnerRole) return { ping: \`<@&\${partnerRole.id}>\`, allowedMentions: { roles: [partnerRole.id] } };
    return { ping: null, allowedMentions: { parse: [] } };
  }
  if (level === 2) {
    return { ping: '@here', allowedMentions: { parse: ['everyone'] } };
  }
  if (level === 3) {
    const parts = [], roles = [];
    if (partnerRole) { parts.push(\`<@&\${partnerRole.id}>\`); roles.push(partnerRole.id); }
    parts.push('@here');
    return { ping: parts.join(' '), allowedMentions: { parse: ['everyone'], roles } };
  }
  // level 4 — member role
  if (memberRole) return { ping: \`<@&\${memberRole.id}>\`, allowedMentions: { roles: [memberRole.id] } };
  return { ping: '@here', allowedMentions: { parse: ['everyone'] } };
}`;

const newResolvePing = `async function resolvePing(sourceGuild, targetGuild, targetCfg) {
  const globalCfg = await setupStore.get('global');
  if (globalCfg?.pingEnabled === false) return { level: 0, ping: null, role: null };
  if (targetCfg.pingEnabled === false) return { level: 0, ping: null, role: null };

  const n = targetGuild.memberCount;
  const m = sourceGuild.memberCount;
  const ratio = m / Math.max(n, 1);

  // Level: 0=nothing, 1=partner ping, 2=member role
  let level;

  if (n >= 500) {
    if      (ratio >= 0.71) level = 2;
    else if (ratio >= 0.38) level = 1;
    else                    level = 0;
  } else if (n >= 200) {
    if      (ratio >= 0.60) level = 2;
    else if (ratio >= 0.20) level = 1;
    else                    level = 0;
  } else if (n >= 50) {
    if      (ratio >= 0.50) level = 2;
    else                    level = 1;
  } else {
    level = ratio >= 0.85 ? 2 : 1;
  }

  const partnerRole = targetCfg.partnerPingRoleId ? targetGuild.roles.cache.get(targetCfg.partnerPingRoleId) : null;
  const memberRole = targetCfg.memberRoleId ? targetGuild.roles.cache.get(targetCfg.memberRoleId) : null;

  if (level === 2 && !memberRole) level = 1;
  if (level === 1 && !partnerRole) level = 0;

  if (level === 2) return { level, ping: \`<@&\${memberRole.id}>\`, role: memberRole.id };
  if (level === 1) return { level, ping: \`<@&\${partnerRole.id}>\`, role: partnerRole.id };
  return { level: 0, ping: null, role: null };
}`;

code = code.replace(oldResolvePing, newResolvePing);

const oldBroadcastInnerLoop = `      const incomingAds = [];
      const allPings = new Set();
      const allRoles = new Set();
      let parseEveryone = false;

      for (const pId of server.partners) {
        const partner = pool.find(g => g.guildId === pId);
        if (!partner) continue;
        incomingAds.push(partner.rawAd);
        
        const pingObj = await resolvePing(partner.guild, server.guild, server.cfg);
        if (pingObj.ping) {
          const parts = pingObj.ping.split(' ');
          for (const part of parts) {
            if (part) allPings.add(part);
          }
        }
        if (pingObj.allowedMentions.parse?.includes('everyone')) parseEveryone = true;
        if (pingObj.allowedMentions.roles) {
          for (const r of pingObj.allowedMentions.roles) allRoles.add(r);
        }
      }

      const finalPingStr = Array.from(allPings).join(' ');
      const allowedMentions = {
        parse: parseEveryone ? ['everyone'] : [],
        roles: Array.from(allRoles)
      };`;

const newBroadcastInnerLoop = `      const incomingAds = [];
      let maxLevel = -1;
      let highestPingObj = null;

      for (const pId of server.partners) {
        const partner = pool.find(g => g.guildId === pId);
        if (!partner) continue;
        incomingAds.push(partner.rawAd);
        
        const pingObj = await resolvePing(partner.guild, server.guild, server.cfg);
        if (pingObj.level > maxLevel) {
          maxLevel = pingObj.level;
          highestPingObj = pingObj;
        }
      }

      const finalPingStr = highestPingObj?.ping || '';
      const allowedMentions = {
        parse: [],
        roles: highestPingObj?.role ? [highestPingObj.role] : []
      };`;

code = code.replace(oldBroadcastInnerLoop, newBroadcastInnerLoop);

fs.writeFileSync(file, code);
console.log("Refactored pings");
