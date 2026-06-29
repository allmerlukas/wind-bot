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

      // ── Check 1: Minimum Members ───────────────────────────────────────────
      if (guild.memberCount < 20) {
        if (user) {
          const leaveEmbed = new EmbedBuilder()
            .setColor(0xED4245)
            .setTitle('❌ Wind Bot Left Your Server')
            .setDescription(
              `Hi there! I noticed you just added me to **${guild.name}**.\n\n` +
              `Unfortunately, your server currently has **${guild.memberCount} members**, but Auto-Wave requires a strict minimum of **20 members** to maintain the network's quality.\n\n` +
              `Because of this, I have automatically left the server. You are more than welcome to invite me back once your server reaches 20 members!`
            )
            .setFooter({ text: 'Wind Bot • Automated partner system' })
            .setTimestamp();
          await user.send({ embeds: [leaveEmbed] }).catch(() => {});
        }
        await guild.leave().catch(() => {});
        return;
      }

      // ── Check 2: Required Permissions ──────────────────────────────────────
      const requiredPerms = [
        { flag: PermissionFlagsBits.ViewChannel, name: 'View Channels' },
        { flag: PermissionFlagsBits.SendMessages, name: 'Send Messages' },
        { flag: PermissionFlagsBits.EmbedLinks, name: 'Embed Links' },
        { flag: PermissionFlagsBits.MentionEveryone, name: 'Mention Everyone' },
        { flag: PermissionFlagsBits.CreateInstantInvite, name: 'Create Invite' }
      ];

      const missingPerms = [];
      const myPerms = guild.members.me?.permissions;
      
      if (myPerms) {
        for (const p of requiredPerms) {
          if (!myPerms.has(p.flag)) {
            missingPerms.push(p.name);
          }
        }
      }

      if (missingPerms.length > 0) {
        if (user) {
          const warnEmbed = new EmbedBuilder()
            .setColor(0xFEE75C)
            .setTitle('⚠️ Wind Bot is Missing Permissions!')
            .setDescription(
              `Hi there! Thanks for adding me to **${guild.name}**.\n\n` +
              `Before you can start using Auto-Wave, I noticed that I was not granted all the required permissions when you invited me. Without these, I will fail to post ads and your server will be skipped.\n\n` +
              `**Missing Permissions:**\n` +
              missingPerms.map(p => `• ${p}`).join('\n') + `\n\n` +
              `Please go to your server settings -> Roles, and ensure the **Wind Bot** role has these permissions enabled so the bot functions smoothly!\n\n` +
              `Once that's fixed, use \`/config setup\` in your server to join the partner network!`
            )
            .setFooter({ text: 'Wind Bot • Automated partner system' })
            .setTimestamp();
          await user.send({ embeds: [warnEmbed] }).catch(() => {});
        }
        return;
      }

      // ── Success: Send standard welcome ─────────────────────────────────────
      if (user) {
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

        await user.send({ embeds: [embed] }).catch(() => {});
      }
      
      const setupStore = require('../utils/setupStore');
      await setupStore.syncUserRoles(guild.ownerId, client);
      
    } catch (err) {
      console.error(`❌ Error in guildCreate for ${guild.name}:`, err);
    }
  },
};
