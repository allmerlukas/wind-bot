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
          `Do you need help using the bot? Use the \`/help\` command in your server to see everything I can do!\n\n` +
          `If you're looking to set up the Auto-Wave partner system, run \`/config setup\` in your server to get started.`
        )
        .setFooter({ text: 'Wind Bot' })
        .setTimestamp();

      await user.send({ embeds: [embed] }).catch(() => {
        // Cannot DM user (DMs disabled)
        console.log(`[GuildCreate] Failed to DM ${user.tag} (DMs disabled).`);
      });

    } catch (err) {
      console.error(`❌ Error in guildCreate for ${guild.name}:`, err);
    }
  },
};
