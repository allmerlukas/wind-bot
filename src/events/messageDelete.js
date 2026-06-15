const setupStore                 = require('../utils/setupStore');
const { blacklistGuild }         = require('../utils/blacklistStore');
const { botDeletedMessages }     = require('../utils/autoWaveEngine');

module.exports = {
  name: 'messageDelete',
  async execute(message, client) {
    // Ignore if not in a guild
    if (!message.guild) return;

    // If the message is partial (uncached), we can't check the author — skip safely
    if (message.partial) return;

    // Ignore if the deleted message was NOT sent by the bot itself
    if (message.author?.id !== client.user.id) return;

    // If the bot intentionally deleted this message (e.g. Auto-Wave rollback), ignore it
    if (botDeletedMessages.has(message.id)) {
      botDeletedMessages.delete(message.id); // clean up
      return;
    }

    // Get the guild's Auto-Wave configuration
    const cfg = await setupStore.get(message.guild.id);

    // If the server hasn't set up a partner channel, ignore
    if (!cfg.partnerChannelId) return;

    // Check if the deleted message was in the designated Partner Channel
    if (message.channel.id === cfg.partnerChannelId) {
      // It's a partner ad being deleted by a user — issue a strike.
      const currentStrikes = cfg.strikes || 0;
      const newStrikes = currentStrikes + 1;

      await setupStore.set(message.guild.id, 'strikes', newStrikes);

      // Log to Railway console for debugging
      const preview = message.content?.slice(0, 100) ?? '(no content cached)';
      console.log(`[Strike] ${message.guild.name} (${message.guild.id}) — strike ${newStrikes}/3. Deleted message preview: "${preview}"`);

      // Show a preview of the deleted message so admins know what triggered it
      const msgPreview = message.content
        ? `\`\`\`${message.content.slice(0, 200)}${message.content.length > 200 ? '…' : ''}\`\`\``
        : '*Message content not available (not cached)*';

      const strikeBar = ['□','□','□'].map((_, i) => i < newStrikes ? '🟥' : '□').join(' ');

      // ── Notify the offending server's log channel ──────────────────────────
      let logChannel;
      if (cfg.logChannelId) {
        logChannel = message.guild.channels.cache.get(cfg.logChannelId);
      }

      if (newStrikes >= 3) {
        await blacklistGuild(message.guild.id, 'Deleted partner ads 3 times.');

        if (logChannel?.isTextBased()) {
          try {
            await logChannel.send(
              `🚫 **BLACKLISTED:** A partner ad was deleted from the Partner Channel for the 3rd time!\n` +
              `Your server has been permanently blacklisted from the Auto-Wave network.\n\n` +
              `**Deleted message:**\n${msgPreview}`
            );
          } catch { /* ignore */ }
        }
      } else {
        if (logChannel?.isTextBased()) {
          try {
            await logChannel.send(
              `⚠️ **STRIKE ${newStrikes}/3:** A partner ad was deleted from the Partner Channel!\n` +
              `Auto-Wave relies on a fair economy — if this happens ${3 - newStrikes} more time(s), your server will be permanently blacklisted.\n\n` +
              `**Deleted message:**\n${msgPreview}`
            );
          } catch { /* ignore */ }
        }
      }

      // ── Also notify the bot owner's server log channel ────────────────────
      const ownerGuildId = process.env.GUILD_ID;
      if (ownerGuildId && ownerGuildId !== message.guild.id) {
        try {
          const ownerCfg = await setupStore.get(ownerGuildId);
          const ownerGuild = client.guilds.cache.get(ownerGuildId);
          const ownerLog = ownerCfg.logChannelId
            ? ownerGuild?.channels.cache.get(ownerCfg.logChannelId)
            : null;

          if (ownerLog?.isTextBased()) {
            const action = newStrikes >= 3 ? '🚫 **BLACKLISTED**' : `⚠️ **STRIKE ${newStrikes}/3**`;
            await ownerLog.send(
              `${action} — **${message.guild.name}** (\`${message.guild.id}\`) ${strikeBar}\n` +
              `A partner ad was deleted from their partner channel.\n\n` +
              `**Deleted message:**\n${msgPreview}`
            );
          }
        } catch { /* ignore */ }
      }
    }
  },
};
