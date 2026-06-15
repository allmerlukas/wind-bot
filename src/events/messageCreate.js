const { extractLinks, addLinks } = require('../utils/linkTracker');
const waveSessions = require('../utils/waveSessions');
const waveStore = require('../utils/waveStore');
const { ordinal } = require('../commands/wave');
const { botDeletedMessages } = require('../utils/autoWaveEngine');

const DELETE_DELAY = parseInt(process.env.DELETE_DELAY ?? '5000', 10);

// Converts [label](url) masked links to plain URLs so the ad is copy-pasteable
// Matches any [text](anything) format — covers https://, discord.gg/, etc.
function stripMaskedLinks(text) {
  return text.replace(/\[([^\]]*?)\]\(([^)]+)\)/g, '$2');
}

module.exports = {
  name: 'messageCreate',
  async execute(message) {
    if (message.author.bot) return;

    // ── Wave session handler ──────────────────────────────────────────────────
    const session = waveSessions.getSession(message.author.id);
    if (session) {
      const content = message.content.trim();
      const lower = content.toLowerCase();

      // ── DM fix session: repair dead invite links one by one ─────────────────
      if (session.type === 'dmFix' && !message.guild) {
        if (lower === 'cancel') {
          waveSessions.endSession(message.author.id);
          await message.channel.send('❌ Dead link fix cancelled. Run `/wave paste` again after manually updating the wave.');
          return;
        }

        if (!content) return;

        const { deadLinks, queueIdx, waveKey, displayName } = session;
        const { adIndex } = deadLinks[queueIdx];

        // Update this ad
        waveStore.updateAd(message.author.id, waveKey, adIndex, content);

        const nextIdx = queueIdx + 1;
        if (nextIdx >= deadLinks.length) {
          // All dead links fixed!
          waveSessions.endSession(message.author.id);
          await message.channel.send([
            `✅ **All dead links fixed!** Your wave has been updated.`,
            `Use \`/wave paste\` to send it again.`,
          ].join('\n'));
        } else {
          // More to fix
          session.queueIdx = nextIdx;
          const next = deadLinks[nextIdx];
          const wave = waveStore.getWave(message.author.id, waveKey);
          const ads = wave?.ads ?? [];
          const adPreview = (ads[next.adIndex] ?? '').slice(0, 200);

          await message.channel.send([
            `✅ Updated! Now fix **Server ${next.adIndex + 1}**:`,
            `> ${adPreview}${adPreview.length === 200 ? '...' : ''}`,
            '',
            `Send the new ad for Server ${next.adIndex + 1}:`,
          ].join('\n'));
        }
        return;
      }

      // ── Edit session: capture one message then done ─────────────────────────
      if (session.type === 'edit') {
        if (lower === 'cancel') {
          waveSessions.endSession(message.author.id);
          const r = await message.channel.send(`❌ <@${message.author.id}> Edit cancelled.`);
          setTimeout(() => r.delete().catch(() => {}), 4000);
          return;
        }

        if (!content) return;

        waveStore.updateAd(message.author.id, session.waveName, session.serverIndex, stripMaskedLinks(content));
        waveSessions.endSession(message.author.id);

        const r = await message.channel.send(
          `✅ <@${message.author.id}> Server **${session.serverIndex + 1}** updated!`
        );
        setTimeout(() => r.delete().catch(() => {}), 5000);
        return;
      }

      // ── Insert session: splice new ad at position ────────────────────────────
      if (session.type === 'insert') {
        if (lower === 'cancel') {
          waveSessions.endSession(message.author.id);
          const r = await message.channel.send(`❌ <@${message.author.id}> Insert cancelled.`);
          setTimeout(() => r.delete().catch(() => {}), 4000);
          return;
        }

        if (!content) return;

        const { waveName, spliceIndex } = session;
        waveStore.insertAd(message.author.id, waveName, spliceIndex, stripMaskedLinks(content));
        waveSessions.endSession(message.author.id);

        const wave = waveStore.getWave(message.author.id, waveName);
        const newPos = spliceIndex + 1; // 1-based position of the inserted ad
        const r = await message.channel.send(
          `✅ <@${message.author.id}> New ad inserted as **server ${newPos}**! Wave now has **${wave.ads.length}** server(s).`
        );
        setTimeout(() => r.delete().catch(() => {}), 6000);
        return;
      }

      // ── Create session ──────────────────────────────────────────────────────
      if (session.type === 'create') {
        if (lower === 'cancel') {
          waveSessions.endSession(message.author.id);
          const r = await message.channel.send(`❌ <@${message.author.id}> Wave creation cancelled.`);
          setTimeout(() => r.delete().catch(() => {}), 4000);
          return;
        }

        if (lower === 'done') {
          const ended = waveSessions.endSession(message.author.id);
          if (!ended || ended.ads.length === 0) {
            const r = await message.channel.send(`❌ <@${message.author.id}> No ads added — wave cancelled.`);
            setTimeout(() => r.delete().catch(() => {}), 4000);
            return;
          }
          waveStore.saveWave(message.author.id, ended.waveName, ended.ads);
          const r = await message.channel.send(
            `✅ <@${message.author.id}> Wave saved with **${ended.ads.length}** server(s)! Use \`/wave paste\` to send it.`
          );
          setTimeout(() => r.delete().catch(() => {}), 6000);
          return;
        }

        if (!content) return;

        const currentStep = session.ads.length + 1;
        waveSessions.addAd(message.author.id, stripMaskedLinks(content));
        const nextStep = session.ads.length + 1;

        const r = await message.channel.send(
          `✅ <@${message.author.id}> Got **server ${currentStep}**! Send your **${ordinal(nextStep)} server** ad — or type \`done\` to save.`
        );
        setTimeout(() => r.delete().catch(() => {}), 6000);
        return;
      }
    }

    // ── Partner link tracking (guild only) ────────────────────────────────────
    if (!message.guild) return;

    const links = extractLinks(message.content);
    if (links.length === 0) return;

    const { newLinksAdded, totalPartners } = await addLinks(
      message.author.id,
      message.author.username,
      links
    );
    if (newLinksAdded === 0) return;

    const partnerWord = totalPartners === 1 ? 'partner' : 'partners';
    const addedWord = newLinksAdded === 1 ? '1 new partner' : `${newLinksAdded} new partners`;

    const notification = await message.channel.send(
      `🔗 <@${message.author.id}> added ${addedWord}! You now have **${totalPartners}** ${partnerWord} in total.`
    ).catch(() => null);

    if (notification) {
      // Register before deleting so messageDelete doesn't issue a false strike
      botDeletedMessages.add(notification.id);
      setTimeout(() => notification.delete().catch(() => {}), DELETE_DELAY);
    }
  }
};
