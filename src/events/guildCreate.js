/**
 * guildCreate event
 * Fired when the bot joins a new server.
 */

const { EmbedBuilder, AuditLogEvent, PermissionFlagsBits } = require('discord.js');

module.exports = {
  name: 'guildCreate',
  async execute(guild, client) {
    try {
      // Wait a moment to ensure guild is fully cached
      await new Promise(r => setTimeout(r, 1000));

      let inviterId = guild.ownerId; // Fallback to server owner

      // Try to fetch audit logs to see who actually added the bot
      try {
        // Check if we have permission to view audit logs first
        if (guild.members.me?.permissions.has(PermissionFlagsBits.ViewAuditLog)) {
          const auditLogs = await guild.fetchAuditLogs({
            type: AuditLogEvent.BotAdd,
            limit: 1,
          });
          const botAddLog = auditLogs.entries.first();
          if (botAddLog && botAddLog.target?.id === client.user.id) {
            inviterId = botAddLog.executorId;
          }
        }
      } catch (err) {
        // Ignore error, fallback to owner
      }

      // Fetch the user
      const user = await client.users.fetch(inviterId).catch(() => null);
      if (!user) return;

      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('👋 Thanks for adding Wind Bot!')
        .setDescription(
          `Hi there! I noticed you just added me to **${guild.name}**.\n\n` +
          `Use \`/help\` in your server to see everything I can do, and run \`/config setup\` to join the Auto-Wave partner network.\n\n` +
          `**💬 Need help?**\n` +
          `Join our support server — the team is there to help you with setup and any questions.\n` +
          `[Join Support Server](https://discord.gg/mK2PnterFn)\n\n` +
          `**⭐ Enjoying the bot?**\n` +
          `Voting takes 10 seconds, it's completely free, and it helps Wind Bot reach more servers. Every vote makes a real difference.\n` +
          `[Vote on Top.gg](https://top.gg/bot/1503116214321545226?s=0c5553caea9a1)`
        )
        .setFooter({ text: 'Wind Bot • Automated partner system' })
        .setTimestamp();

      await user.send({ embeds: [embed] }).catch(() => {
        // Cannot DM user (DMs disabled)
      });

    } catch (err) {
      console.error(`❌ Error in guildCreate for ${guild.name}:`, err);
    }
  },
};
