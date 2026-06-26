const fs = require('fs');
const file = './src/utils/autoWaveEngine.js';
let content = fs.readFileSync(file, 'utf8');

// Update imports
content = content.replace(
  "const { recordPair, pairedRecently, nextSource }   = require('./pairStore');",
  "const { recordPair, pairedRecently }               = require('./pairStore');"
);

// We want to replace everything from "if (readyGuilds.length < 2) return;" 
// down to "} catch (err) {" inside the tick() function.

const startMarker = "    if (readyGuilds.length < 2) return;";
const endMarker = "  } catch (err) {";

const startIndex = content.indexOf(startMarker);
const endIndex = content.indexOf(endMarker, startIndex);

if (startIndex === -1 || endIndex === -1) {
  console.log("Could not find markers!");
  process.exit(1);
}

const newLogic = \    if (readyGuilds.length < 2) return;

    // 2. Batch Match Processing ------------------------------------------------
    let pool = readyGuilds.map(g => ({
      ...g,
      targetCount: g.cfg.allowPaidAds ? 2 : 1,
      currentCount: 0,
      partners: []
    }));

    pool = shuffle(pool);

    async function canPartner(a, b) {
      if (a.partners.includes(b.guildId) || b.partners.includes(a.guildId)) return false;
      if (await pairedRecently(a.guildId, b.guildId)) return false;

      const aCount = a.guild.memberCount;
      const bCount = b.guild.memberCount;
      const aMin = a.cfg.minMembers ?? null;
      const aMax = a.cfg.maxMembers ?? null;
      const bMin = b.cfg.minMembers ?? null;
      const bMax = b.cfg.maxMembers ?? null;

      if (aMin !== null && aMax !== null && (bCount < aMin || bCount > aMax)) return false;
      if (bMin !== null && bMax !== null && (aCount < bMin || aCount > bMax)) return false;
      if (bCount < MIN_MEMBERS || aCount < MIN_MEMBERS) return false;

      return true;
    }

    // Build the partner graph
    for (const serverA of pool) {
      while (serverA.currentCount < serverA.targetCount) {
        let matched = false;
        
        const candidates = shuffle(pool);
        for (const serverB of candidates) {
          if (serverA.guildId === serverB.guildId) continue;
          if (serverB.currentCount >= serverB.targetCount) continue;
          
          if (await canPartner(serverA, serverB)) {
             serverA.partners.push(serverB.guildId);
             serverB.partners.push(serverA.guildId);
             serverA.currentCount++;
             serverB.currentCount++;
             matched = true;
             break;
          }
        }
        if (!matched) break;
      }
    }

    // 3. Execute Bilateral Trades ----------------------------------------------
    const executed = new Set();

    for (const serverA of pool) {
      if (serverA.currentCount === 0) {
        await logAndEdit(
          serverA.guildId, 'no_match', serverA.guild, serverA.cfg,
          \? **Auto-Wave:** No eligible partners found this tick. The network will try again later.\
        );
        continue;
      }

      for (const bId of serverA.partners) {
        const pairStr = serverA.guildId < bId ? \\:\\ : \\:\\;
        if (executed.has(pairStr)) continue;

        const serverB = pool.find(g => g.guildId === bId);
        if (!serverB) continue;

        const pingAForB = await resolvePing(serverB.guild, serverA.guild, serverA.cfg);
        const finalAdB  = pingAForB.ping ? \\\\n\\n\\ : serverB.rawAd;

        const pingBForA = await resolvePing(serverA.guild, serverB.guild, serverB.cfg);
        const finalAdA  = pingBForA.ping ? \\\\n\\n\\ : serverA.rawAd;

        const channelA = serverA.guild.channels.cache.get(serverA.cfg.partnerChannelId);
        const channelB = serverB.guild.channels.cache.get(serverB.cfg.partnerChannelId);

        let successA = false;
        let msgA = null;
        try {
          msgA = await channelA.send({
            content: finalAdB,
            components: [buildAddBotRow(client.user.id)],
            allowedMentions: pingAForB.allowedMentions,
          });
          successA = true;
        } catch {
          await logAndEdit(
            serverA.guildId, 'post_fail', serverA.guild, serverA.cfg,
            \?? **Auto-Wave:** Failed to post an incoming partner ad. Check bot permissions in <#\>.\
          );
        }

        let successB = false;
        let msgB = null;
        try {
          msgB = await channelB.send({
            content: finalAdA,
            components: [buildAddBotRow(client.user.id)],
            allowedMentions: pingBForA.allowedMentions,
          });
          successB = true;
        } catch {
          await logAndEdit(
            serverB.guildId, 'post_fail', serverB.guild, serverB.cfg,
            \?? **Auto-Wave:** Failed to post an incoming partner ad. Check bot permissions in <#\>.\
          );
        }

        if (successA && successB) {
          await recordPair(serverA.guildId, serverB.guildId);
          clearSpam(serverA.guildId, 'no_match');
          clearSpam(serverB.guildId, 'no_match');
          clearSpam(serverA.guildId, 'post_fail');
          clearSpam(serverB.guildId, 'post_fail');
          clearSpam(serverA.guildId, 'trade_fail');
          clearSpam(serverB.guildId, 'trade_fail');
        } else {
          if (successA && msgA) {
            botDeletedMessages.add(msgA.id);
            await msgA.delete().catch(() => {});
          }
          if (successB && msgB) {
            botDeletedMessages.add(msgB.id);
            await msgB.delete().catch(() => {});
          }
          await logAndEdit(
            serverA.guildId, 'trade_fail', serverA.guild, serverA.cfg,
            \? **Auto-Wave:** Found a match (**\**) but the trade failed due to a permission error. Safely cancelled.\
          );
          await logAndEdit(
            serverB.guildId, 'trade_fail', serverB.guild, serverB.cfg,
            \? **Auto-Wave:** Found a match (**\**) but the trade failed due to a permission error. Safely cancelled.\
          );
        }
        
        executed.add(pairStr);
      }

      await autoWaveStore.setLastReceived(serverA.guildId);
    }
\;

const newContent = content.substring(0, startIndex) + newLogic + content.substring(endIndex);
fs.writeFileSync(file, newContent, 'utf8');
console.log("Rewrote autoWaveEngine.js successfully.");
