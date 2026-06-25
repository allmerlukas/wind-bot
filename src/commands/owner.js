/**
 * /owner — Owner-only control panel
 *
 * Subcommands:
 *   /owner status         — Bot stats: uptime, memory, guild count, user count
 *   /owner guilds         — List every server the bot is in
 *   /owner autowave       — Show Auto-Wave enrollment across all guilds
 *   /owner broadcast      — Send to every guild’s log channel, DM owner if no log channel
 *   /owner invite         — Get an invite link from a server (pick from list)
 *   /owner leave          — Leave a server (pick from list)
 *   /owner ping           — Toggle Auto-Wave pings on/off for a specific server
 *   /owner strike-reset   — Reset a server’s strike count to 0
 *   /owner error          — View the most recent bot errors
 *   /owner blacklist-add  — Ban a guild from Auto-Wave
 *   /owner blacklist-remove
 *   /owner blacklist-list
 */

const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} = require('discord.js');

const { checkOwner }    = require('../utils/ownerGuard');
const setupStore        = require('../utils/setupStore');
const supabase          = require('../utils/supabase');
const { getRecentErrors, getErrorCount } = require('../utils/errorStore');
const {
  blacklistGuild, unblacklistGuild, getAllBlacklisted,
  addWhitelistedDomain, removeWhitelistedDomain, getWhitelistedDomains,
} = require('../utils/blacklistStore');

// ─── Helper: build guild select menu (max 25 options) ────────────────────────

function buildGuildMenu(client, customId) {
  const guilds = [...client.guilds.cache.values()]
    .sort((a, b) => b.memberCount - a.memberCount)
    .slice(0, 25);

  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(customId)
      .setPlaceholder('Choose a server...')
      .addOptions(
        guilds.map(g =>
          new StringSelectMenuOptionBuilder()
            .setLabel(g.name.slice(0, 100))
            .setDescription(`${g.memberCount} members • ${g.id}`)
            .setValue(g.id)
        )
      )
  );
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('owner')
    .setDescription('Owner-only bot controls')
    .setDefaultMemberPermissions(0n)

    // status
    .addSubcommand(sub =>
      sub.setName('status')
        .setDescription('Show bot stats: uptime, memory, guilds, users')
    )

    // guilds
    .addSubcommand(sub =>
      sub.setName('guilds')
        .setDescription('List all servers the bot is in')
    )

    // autowave
    .addSubcommand(sub =>
      sub.setName('autowave')
        .setDescription('Show Auto-Wave config status across all guilds')
    )

    // broadcast
    .addSubcommand(sub =>
      sub.setName('broadcast')
        .setDescription('Send a message to all servers — choose log channel or partner channel')
        .addStringOption(opt =>
          opt.setName('message')
            .setDescription('Message to send')
            .setRequired(true)
        )
        .addStringOption(opt =>
          opt.setName('destination')
            .setDescription('Where to send it')
            .setRequired(true)
            .addChoices(
              { name: 'Log channel — all servers (general broadcast)', value: 'log' },
              { name: 'Partner channel — opted-in only (paid ad)',     value: 'partner' },
            )
        )
    )

    // invite
    .addSubcommand(sub =>
      sub.setName('invite')
        .setDescription('Get an invite link from one of the servers the bot is in')
    )

    // leave
    .addSubcommand(sub =>
      sub.setName('leave')
        .setDescription('Make the bot leave one of its servers')
    )

    // ping toggle (global)
    .addSubcommand(sub =>
      sub.setName('ping')
        .setDescription('Turn Auto-Wave pings on or off for ALL servers')
        .addStringOption(opt =>
          opt.setName('setting')
            .setDescription('on or off')
            .setRequired(true)
            .addChoices(
              { name: '✅ On  — pings enabled for all servers', value: 'on' },
              { name: '🔕 Off — silent posts for all servers', value: 'off' },
            )
        )
    )

    // strike-reset
    .addSubcommand(sub =>
      sub.setName('strike-reset')
        .setDescription('Reset the strike count for a server back to 0')
        .addStringOption(opt =>
          opt.setName('guild_id')
            .setDescription('The server ID to reset strikes for')
            .setRequired(true)
        )
    )

    // check
    .addSubcommand(sub =>
      sub.setName('check')
        .setDescription('Check strikes and blacklist status for a server')
        .addStringOption(opt =>
          opt.setName('guild_id')
            .setDescription('The server ID to check')
            .setRequired(true)
        )
    )

    // error
    .addSubcommand(sub =>
      sub.setName('error')
        .setDescription('View the most recent bot errors')
        .addIntegerOption(opt =>
          opt.setName('count')
            .setDescription('How many to show (1–20, default 10)')
            .setMinValue(1)
            .setMaxValue(20)
            .setRequired(false)
        )
    )

    // blacklist-add
    .addSubcommand(sub =>
      sub.setName('blacklist-add')
        .setDescription('Ban a guild from the Auto-Wave network')
        .addStringOption(opt =>
          opt.setName('guild_id').setDescription('Guild ID to blacklist').setRequired(true)
        )
        .addStringOption(opt =>
          opt.setName('reason').setDescription('Reason for blacklisting').setRequired(true)
        )
    )

    // blacklist-remove
    .addSubcommand(sub =>
      sub.setName('blacklist-remove')
        .setDescription('Remove a guild from the blacklist')
        .addStringOption(opt =>
          opt.setName('guild_id').setDescription('Guild ID to unblacklist').setRequired(true)
        )
    )

    // blacklist-list
    .addSubcommand(sub =>
      sub.setName('blacklist-list')
        .setDescription('Show all blacklisted guilds and whitelisted link domains')
    )

    // strike-add
    .addSubcommand(sub =>
      sub.setName('strike-add')
        .setDescription('Add a strike to a server')
        .addStringOption(opt =>
          opt.setName('guild_id')
            .setDescription('The server ID to strike')
            .setRequired(true)
        )
        .addStringOption(opt =>
          opt.setName('reason')
            .setDescription('Reason for the strike')
            .setRequired(true)
        )
    ),

  async execute(interaction) {
    if (!await checkOwner(interaction)) return;

    const sub    = interaction.options.getSubcommand();
    const client = interaction.client;

    // ── /owner status ─────────────────────────────────────────────────────────
    if (sub === 'status') {
      await interaction.deferReply({ ephemeral: true });
      await client.application.fetch();

      const uptimeMs  = client.uptime ?? 0;
      const uptimeSec = Math.floor(uptimeMs / 1000);
      const days      = Math.floor(uptimeSec / 86400);
      const hours     = Math.floor((uptimeSec % 86400) / 3600);
      const mins      = Math.floor((uptimeSec % 3600) / 60);
      const secs      = uptimeSec % 60;
      const uptimeStr = `${days}d ${hours}h ${mins}m ${secs}s`;

      const memMB      = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1);
      const guildCount = client.guilds.cache.size;
      const userCount  = client.application.approximateUserInstallCount ?? 0;
      const ping       = client.ws.ping;

      // Total partnerships ever done across the whole network
      const { count: totalPartnerships } = await supabase
        .from('wave_pairs')
        .select('*', { count: 'exact', head: true });

      const totalMembers = client.guilds.cache.reduce((sum, g) => sum + (g.memberCount || 0), 0);

      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('🤖 Bot Status')
        .addFields(
          { name: '⏱️ Uptime',              value: uptimeStr,                          inline: true },
          { name: '🏓 Ping',                value: `${ping}ms`,                        inline: true },
          { name: '🧠 Memory',              value: `${memMB} MB`,                      inline: true },
          { name: '🌐 Guilds',              value: `${guildCount}`,                    inline: true },
          { name: '👥 Members (all servers)', value: totalMembers.toLocaleString(),    inline: true },
          { name: '📦 Node.js',             value: process.version,                    inline: true },
          { name: '🤝 Total Partnerships',  value: `${totalPartnerships ?? 0}`,        inline: true },
        )
        .setFooter({ text: `Logged in as ${client.user.tag}` })
        .setTimestamp();

      return interaction.editReply({ embeds: [embed] });
    }

    // ── /owner guilds ─────────────────────────────────────────────────────────
    if (sub === 'guilds') {
      const guilds = [...client.guilds.cache.values()]
        .sort((a, b) => b.memberCount - a.memberCount);

      const lines = guilds.map((g, i) =>
        `\`${String(i + 1).padStart(2, '0')}.\` **${g.name}** — ${g.memberCount} members \`${g.id}\``
      );

      const page = lines.slice(0, 15).join('\n') || 'No guilds found.';
      const more = guilds.length > 15 ? `\n...and ${guilds.length - 15} more` : '';

      const embed = new EmbedBuilder()
        .setColor(0x57F287)
        .setTitle(`🌐 Guilds (${guilds.length})`)
        .setDescription(page + more)
        .setTimestamp();

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // ── /owner autowave ───────────────────────────────────────────────────────
    if (sub === 'autowave') {
      await interaction.deferReply({ ephemeral: true });

      const guilds   = [...client.guilds.cache.values()];
      const enrolled = [];
      const missing  = [];

      for (const guild of guilds) {
        const cfg = await setupStore.get(guild.id);
        if (cfg.partnerChannelId && cfg.adChannelId && cfg.logChannelId && cfg.memberRoleId && cfg.partnerPingRoleId && cfg.partnerDelayHours) {
          enrolled.push(`✅ **${guild.name}** — delay: ${cfg.partnerDelayHours ?? 24}h | members: ${guild.memberCount}`);
        } else {
          const what = [];
          if (!cfg.partnerChannelId)  what.push('partner_channel');
          if (!cfg.adChannelId)       what.push('ad_channel');
          if (!cfg.logChannelId)      what.push('log_channel');
          if (!cfg.memberRoleId)      what.push('member_role');
          if (!cfg.partnerPingRoleId) what.push('ping_role');
          if (!cfg.partnerDelayHours) what.push('delay_hours');
          missing.push(`❌ **${guild.name}** — missing: \`${what.join(', ')}\``);
        }
      }

      const desc = [
        enrolled.length ? `**Enrolled (${enrolled.length})**\n${enrolled.join('\n')}` : null,
        missing.length  ? `\n**Not Configured (${missing.length})**\n${missing.join('\n')}` : null,
      ].filter(Boolean).join('\n') || 'No guilds found.';

      const embed = new EmbedBuilder()
        .setColor(0xFEE75C)
        .setTitle('🌊 Auto-Wave Enrollment')
        .setDescription(desc.slice(0, 4000))
        .setTimestamp();

      return interaction.editReply({ embeds: [embed] });
    }

    // ── /owner broadcast ──────────────────────────────────────────────────────
    if (sub === 'broadcast') {
      const message     = interaction.options.getString('message');
      const destination = interaction.options.getString('destination');
      await interaction.deferReply({ ephemeral: true });

      let sent = 0, skipped = 0, failed = 0;

      for (const guild of client.guilds.cache.values()) {
        const cfg = await setupStore.get(guild.id);

        if (destination === 'partner') {
          // Paid ad: only servers that opted in, sent to partner channel
          if (!cfg.allowPaidAds) { skipped++; continue; }
          const ch = cfg.partnerChannelId ? guild.channels.cache.get(cfg.partnerChannelId) : null;
          if (ch?.isTextBased()) {
            try { await ch.send(`📢 **[Paid Advertisement]**\n${message}`); sent++; }
            catch { failed++; }
          } else { failed++; }
        } else {
          // General broadcast: all servers, sent to log channel (DM owner as fallback)
          const ch = cfg.logChannelId ? guild.channels.cache.get(cfg.logChannelId) : null;
          if (ch?.isTextBased()) {
            try { await ch.send(`📢 **[Wind Bot Broadcast]**\n${message}`); sent++; }
            catch {
              try { const owner = await client.users.fetch(guild.ownerId); await owner.send(`📢 **[Wind Bot Broadcast]**\n${message}`); sent++; }
              catch { failed++; }
            }
          } else {
            try { const owner = await client.users.fetch(guild.ownerId); await owner.send(`📢 **[Wind Bot Broadcast]**\n${message}`); sent++; }
            catch { failed++; }
          }
        }
      }

      const label = destination === 'partner'
        ? `partner channels (${skipped} server(s) opted out)`
        : 'log channels — all servers';
      return interaction.editReply({
        content: `📢 **Broadcast complete** — ${label}\n✅ Sent: **${sent}** | ❌ Failed: **${failed}**`,
      });
    }

    // ── /owner invite ─────────────────────────────────────────────────────────
    if (sub === 'invite') {
      if (client.guilds.cache.size === 0) {
        return interaction.reply({ content: '❌ The bot is not in any servers.', ephemeral: true });
      }

      return interaction.reply({
        content: '🔗 **Select a server to generate an invite link:**',
        components: [buildGuildMenu(client, 'owner_invite_select')],
        ephemeral: true,
      });
    }

    // ── /owner leave ──────────────────────────────────────────────────────────
    if (sub === 'leave') {
      if (client.guilds.cache.size === 0) {
        return interaction.reply({ content: '❌ The bot is not in any servers.', ephemeral: true });
      }

      return interaction.reply({
        content: '👋 **Select the server you want the bot to leave:**',
        components: [buildGuildMenu(client, 'owner_leave_select')],
        ephemeral: true,
      });
    }

    // ── /owner ping (global toggle) ───────────────────────────────────────────────
    if (sub === 'ping') {
      const enabled = interaction.options.getString('setting') === 'on';
      await setupStore.set('global', 'pingEnabled', enabled);
      return interaction.reply({
        content: enabled
          ? `✅ **Pings enabled globally.** All servers will now ping roles when ads arrive.`
          : `🔕 **Pings disabled globally.** All servers will post ads silently until re-enabled.`,
        ephemeral: true,
      });
    }

    // ── /owner strike-reset ───────────────────────────────────────────────────────────
    if (sub === 'strike-reset') {
      const guildId = interaction.options.getString('guild_id');
      const guild   = client.guilds.cache.get(guildId);
      const name    = guild?.name ?? `\`${guildId}\``;

      await setupStore.set(guildId, 'strikes', 0);
      return interaction.reply({
        content: `✅ Strikes reset to **0** for **${name}**.`,
        ephemeral: true,
      });
    }

    // ── /owner strike-add ────────────────────────────────────────────────────────
    if (sub === 'strike-add') {
      const guildId = interaction.options.getString('guild_id');
      const reason  = interaction.options.getString('reason');
      const guild   = client.guilds.cache.get(guildId);
      const name    = guild?.name ?? `\`${guildId}\``;

      const cfg          = await setupStore.get(guildId);
      const current      = cfg.strikes ?? 0;
      const newStrikes   = current + 1;

      await setupStore.set(guildId, 'strikes', newStrikes);

      const strikeBar = ['□','□','□'].map((_, i) => i < newStrikes ? '🟥' : '□').join(' ');
      const warn = newStrikes >= 3
        ? '\n⚠️ **3 strikes reached** — consider blacklisting this server.'
        : '';

      return interaction.reply({
        content: `⚠️ Strike **${newStrikes}/3** added to **${name}** ${strikeBar}\n> **Reason:** ${reason}${warn}`,
        ephemeral: true,
      });
    }

    // ── /owner check ───────────────────────────────────────────────────────────────
    if (sub === 'check') {
      await interaction.deferReply({ ephemeral: true });
      const guildId    = interaction.options.getString('guild_id');
      const guild      = client.guilds.cache.get(guildId);
      const cfg        = await setupStore.get(guildId);
      const blacklisted = (await getAllBlacklisted()).includes(guildId);
      const strikes    = cfg.strikes ?? 0;
      const name       = guild?.name ?? `Unknown (\`${guildId}\`)`;

      const strikeBar  = ['□','□','□'].map((_, i) => i < strikes ? '🟥' : '□').join(' ');
      const statusLine = blacklisted
        ? '🚫 **BLACKLISTED** — excluded from Auto-Wave'
        : strikes === 0
          ? '✅ Clean — no strikes'
          : `⚠️ **${strikes}/3 strikes** ${strikeBar}`;

      const embed = new EmbedBuilder()
        .setColor(blacklisted ? 0xED4245 : strikes > 0 ? 0xFEE75C : 0x57F287)
        .setTitle(`🔍 ${name}`)
        .addFields(
          { name: 'Server ID',   value: `\`${guildId}\``,            inline: true },
          { name: 'Members',     value: `${guild?.memberCount ?? 'N/A'}`, inline: true },
          { name: 'Status',      value: statusLine,                    inline: false },
          { name: 'Ping',        value: cfg.pingEnabled !== false ? '🔔 Enabled' : '🔕 Disabled', inline: true },
          { name: 'Delay',       value: cfg.partnerDelayHours ? `${cfg.partnerDelayHours}h` : 'Not set', inline: true },
        )
        .setTimestamp();

      return interaction.editReply({ embeds: [embed] });
    }

    // ── /owner error ──────────────────────────────────────────────────────────
    if (sub === 'error') {
      await interaction.deferReply({ ephemeral: true });
      const count  = interaction.options.getInteger('count') ?? 10;
      const errors = await getRecentErrors(count);
      const total  = await getErrorCount();

      if (errors.length === 0) {
        return interaction.editReply({ content: '✅ No errors logged — all good!' });
      }

      const lines = errors.map(e => {
        const ts  = `<t:${Math.floor(e.occurred_at / 1000)}:R>`;
        const src = `\`${e.source}\``;
        const gld = e.guild_id ? ` • guild \`${e.guild_id}\`` : '';
        const msg = e.message.slice(0, 200);
        return `${ts} **${src}**${gld}\n> ${msg}`;
      });

      const embed = new EmbedBuilder()
        .setColor(0xED4245)
        .setTitle(`❌ Recent Errors (${errors.length} of ${total} stored)`)
        .setDescription(lines.join('\n\n').slice(0, 4000))
        .setFooter({ text: `Showing last ${count} • Max stored: 200` })
        .setTimestamp();

      return interaction.editReply({ embeds: [embed] });
    }

    // ── /owner blacklist-add ──────────────────────────────────────────────────
    if (sub === 'blacklist-add') {
      const guildId = interaction.options.getString('guild_id');
      const reason  = interaction.options.getString('reason');
      await blacklistGuild(guildId, reason);
      const name = client.guilds.cache.get(guildId)?.name ?? `\`${guildId}\``;
      return interaction.reply({
        content: `🚫 **${name}** has been blacklisted from Auto-Wave.\n> Reason: ${reason}`,
        ephemeral: true,
      });
    }

    // ── /owner blacklist-remove ───────────────────────────────────────────────
    if (sub === 'blacklist-remove') {
      const guildId = interaction.options.getString('guild_id');
      await unblacklistGuild(guildId);
      const name = client.guilds.cache.get(guildId)?.name ?? `\`${guildId}\``;
      return interaction.reply({
        content: `✅ **${name}** has been removed from the blacklist.`,
        ephemeral: true,
      });
    }

    // ── /owner blacklist-list ─────────────────────────────────────────────────
    if (sub === 'blacklist-list') {
      const banned  = await getAllBlacklisted();
      const domains = await getWhitelistedDomains();

      const bannedLines = banned.length
        ? banned.map(b => {
            const name = client.guilds.cache.get(b.guild_id)?.name ?? b.guild_id;
            return `🚫 **${name}** \`${b.guild_id}\` — ${b.reason}`;
          }).join('\n')
        : '*None*';

      const domainLines = domains.length
        ? domains.map(d => `✅ \`${d}\``).join('\n')
        : '*None (only discord.gg links are allowed by default)*';

      const embed = new EmbedBuilder()
        .setColor(0xED4245)
        .setTitle('🚫 Blacklist & Whitelist')
        .addFields(
          { name: `Blacklisted Guilds (${banned.length})`,        value: bannedLines.slice(0, 1000),  inline: false },
          { name: `Whitelisted Link Domains (${domains.length})`, value: domainLines.slice(0, 1000),  inline: false },
        )
        .setTimestamp();

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }
  },
};
