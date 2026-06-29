const fs = require('fs');
const path = require('path');

// --- Fix autoWaveEngine.js ---
const waveFile = path.join(__dirname, '../src/utils/autoWaveEngine.js');
let waveCode = fs.readFileSync(waveFile, 'utf8');

const oldResolvePing = `async function resolvePing(sourceGuild, targetGuild, targetCfg) {
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

const newResolvePing = `async function resolvePing(sourceGuild, targetGuild, targetCfg) {
  const globalCfg = await setupStore.get('global');
  if (globalCfg?.pingEnabled === false) return { level: 0, ping: null, role: null, parseEveryone: false };
  if (targetCfg.pingEnabled === false) return { level: 0, ping: null, role: null, parseEveryone: false };

  const n = targetGuild.memberCount;
  const m = sourceGuild.memberCount;
  const ratio = m / Math.max(n, 1);

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

  const partnerRole = targetCfg.partnerPingRoleId ? targetGuild.roles.cache.get(targetCfg.partnerPingRoleId) : null;
  const memberRole = targetCfg.memberRoleId ? targetGuild.roles.cache.get(targetCfg.memberRoleId) : null;

  if (level === 4 && !memberRole) level = 3;
  if ((level === 3 || level === 1) && !partnerRole) level = level === 3 ? 2 : 0;

  if (level === 4) return { level, ping: \`<@&\${memberRole.id}>\`, role: memberRole.id, parseEveryone: false };
  if (level === 3) return { level, ping: \`<@&\${partnerRole.id}> @here\`, role: partnerRole.id, parseEveryone: true };
  if (level === 2) return { level, ping: '@here', role: null, parseEveryone: true };
  if (level === 1) return { level, ping: \`<@&\${partnerRole.id}>\`, role: partnerRole.id, parseEveryone: false };
  return { level: 0, ping: null, role: null, parseEveryone: false };
}`;

waveCode = waveCode.replace(oldResolvePing, newResolvePing);

const oldBroadcastInnerLoop = `      const finalPingStr = highestPingObj?.ping || '';
      const allowedMentions = {
        parse: [],
        roles: highestPingObj?.role ? [highestPingObj.role] : []
      };`;

const newBroadcastInnerLoop = `      const finalPingStr = highestPingObj?.ping || '';
      const allowedMentions = {
        parse: highestPingObj?.parseEveryone ? ['everyone'] : [],
        roles: highestPingObj?.role ? [highestPingObj.role] : []
      };`;

waveCode = waveCode.replace(oldBroadcastInnerLoop, newBroadcastInnerLoop);

fs.writeFileSync(waveFile, waveCode);


// --- Fix partner.js ---
const partnerFile = path.join(__dirname, '../src/commands/partner.js');
let partnerCode = fs.readFileSync(partnerFile, 'utf8');

const oldReqs = `      let rows = [];
      if (n >= 500) {
        const t1 = Math.ceil(n * 0.38);
        const t2 = Math.ceil(n * 0.71);
        rows = [
          [\`0 - \${t1 - 1}\`,      'Nothing'],
          [\`\${t1} - \${t2 - 1}\`,  'Partner Ping'],
          [\`\${t2}+\`,             'Member Role'],
        ];
      } else if (n >= 200) {
        const t1 = Math.ceil(n * 0.20);
        const t2 = Math.ceil(n * 0.60);
        rows = [
          [\`0 - \${t1 - 1}\`,      'Nothing'],
          [\`\${t1} - \${t2 - 1}\`,  'Partner Ping'],
          [\`\${t2}+\`,             'Member Role'],
        ];
      } else if (n >= 50) {
        const t1 = Math.ceil(n * 0.50);
        rows = [
          [\`0 - \${t1 - 1}\`,  'Partner Ping'],
          [\`\${t1}+\`,         'Member Role'],
        ];
      } else {
        const t1 = Math.ceil(n * 0.85);
        rows = [
          [\`0 - \${t1 - 1}\`, 'Partner Ping'],
          [\`\${t1}+\`,         'Member Role'],
        ];
      }`;

const newReqs = `      let rows = [];
      if (n >= 500) {
        const t1 = Math.ceil(n * 0.38);
        const t2 = Math.ceil(n * 0.51);
        const t3 = Math.ceil(n * 0.71);
        const t4 = Math.ceil(n * 0.92);
        rows = [
          [\`0 - \${t1 - 1}\`,      'Nothing'],
          [\`\${t1} - \${t2 - 1}\`,  'Partner Ping'],
          [\`\${t2} - \${t3 - 1}\`,  '@here'],
          [\`\${t3} - \${t4 - 1}\`,  'Partner Ping + @here'],
          [\`\${t4}+\`,             'Member Role'],
        ];
      } else if (n >= 200) {
        const t1 = Math.ceil(n * 0.20);
        const t2 = Math.ceil(n * 0.40);
        const t3 = Math.ceil(n * 0.60);
        const t4 = Math.ceil(n * 0.90);
        rows = [
          [\`0 - \${t1 - 1}\`,      'Nothing'],
          [\`\${t1} - \${t2 - 1}\`,  'Partner Ping'],
          [\`\${t2} - \${t3 - 1}\`,  '@here'],
          [\`\${t3} - \${t4 - 1}\`,  'Partner Ping + @here'],
          [\`\${t4}+\`,             'Member Role'],
        ];
      } else if (n >= 50) {
        const t1 = Math.ceil(n * 0.50);
        const t2 = Math.ceil(n * 0.85);
        rows = [
          [\`0 - \${t1 - 1}\`,  'Partner Ping'],
          [\`\${t1} - \${t2 - 1}\`, '@here'],
          [\`\${t2}+\`,         'Member Role'],
        ];
      } else {
        const t1 = Math.ceil(n * 0.85);
        rows = [
          [\`0 - \${t1 - 1}\`, 'Partner Ping'],
          [\`\${t1}+\`,         'Member Role'],
        ];
      }`;

partnerCode = partnerCode.replace(oldReqs, newReqs);
fs.writeFileSync(partnerFile, partnerCode);
console.log("Restored @here pings");
