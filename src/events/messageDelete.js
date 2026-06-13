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

      // Attempt to notify their log channel
      let logChannel;
      if (cfg.logChannelId) {
        logChannel = message.guild.channels.cache.get(cfg.logChannelId);
      }

      if (newStrikes >= 3) {
        // Strike 3: Blacklist the server
        await blacklistGuild(message.guild.id, 'Deleted partner ads 3 times.');

        if (logChannel?.isTextBased()) {
          try {
            await logChannel.send(`🚫 **BLACKLISTED:** A partner ad was deleted from the Partner Channel for the 3rd time! Your server has been permanently blacklisted from the Auto-Wave network and will no longer receive partners.`);
          } catch { /* ignore */ }
        }
      } else {
        // Strike 1 or 2: Send a warning
        if (logChannel?.isTextBased()) {
          try {
            await logChannel.send(`⚠️ **STRIKE ${newStrikes}/3:** A partner ad was just manually deleted from the Partner Channel! Auto-Wave relies on a fair economy. If this happens ${3 - newStrikes} more time(s), your server will be permanently blacklisted from the Auto-Wave network.`);
          } catch { /* ignore */ }
        }
      }
    }
  },
};
