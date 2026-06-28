const {
  SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
  ModalBuilder, TextInputBuilder, TextInputStyle, ButtonBuilder, ButtonStyle
} = require('discord.js');

const { checkOwner }    = require('../utils/ownerGuard');
const setupStore        = require('../utils/setupStore');
const supabase          = require('../utils/supabase');
const { getRecentErrors, getErrorCount } = require('../utils/errorStore');
const { blacklistGuild, unblacklistGuild, getAllBlacklisted, getWhitelistedDomains } = require('../utils/blacklistStore');

// ─── Constants & Menus ────────────────────────────────────────────────────────

const DASHBOARD_OPTIONS = [
  { label: 'Status', value: 'status', description: 'Bot stats: uptime, memory, guilds', emoji: '📊', vip: true },
  { label: 'Auto-Wave Check', value: 'autowave', description: 'Show Auto-Wave config status', emoji: '🌊', vip: true },
  { label: 'Check All Servers', value: 'check', description: 'Check strikes and blacklist status', emoji: '🔍', vip: true },
  { label: 'View Errors', value: 'error', description: 'View the most recent bot errors', emoji: '❌', vip: true },
  { label: 'Generate Invite', value: 'invite', description: 'Get an invite link for a server', emoji: '🔗', vip: true },
  { label: 'Guilds List', value: 'guilds', description: 'List all servers the bot is in', emoji: '🌐', vip: false },
  { label: 'Broadcast', value: 'broadcast', description: 'Send a message to servers', emoji: '📢', vip: false },
  { label: 'Toggle Ping', value: 'ping', description: 'Turn Auto-Wave pings on/off globally', emoji: '🔕', vip: false },
  { label: 'Add Strike', value: 'strike-add', description: 'Add a strike to a server', emoji: '⚠️', vip: false },
  { label: 'Reset Strikes', value: 'strike-reset', description: 'Reset a server\'s strike count', emoji: '🔄', vip: false },
  { label: 'Blacklist Server', value: 'blacklist-add', description: 'Ban a server from Auto-Wave', emoji: '🚫', vip: false },
  { label: 'Unblacklist Server', value: 'blacklist-remove', description: 'Remove server from blacklist', emoji: '✅', vip: false },
  { label: 'Blacklist List', value: 'blacklist-list', description: 'Show all blacklisted servers', emoji: '📜', vip: false },
  { label: 'Leave Server', value: 'leave', description: 'Make the bot leave a server', emoji: '👋', vip: false },
];

function buildDashboardMenu(isVip) {
  const options = DASHBOARD_OPTIONS.filter(o => !isVip || o.vip);
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(isVip ? 'vip_dashboard_select' : 'owner_dashboard_select')
      .setPlaceholder('Select an action...')
      .addOptions(
        options.map(o => 
          new StringSelectMenuOptionBuilder()
            .setLabel(o.label)
            .setValue(o.value)
            .setDescription(o.description)
            .setEmoji(o.emoji)
        )
      )
  );
}

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

// ─── Logic Handlers ───────────────────────────────────────────────────────────

async function handleStatus(client, interaction) {
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
  const ping       = client.ws.ping;

  const { count: totalPartnerships } = await supabase.from('wave_pairs').select('*', { count: 'exact', head: true });
  const totalMembers = client.guilds.cache.reduce((sum, g) => sum + (g.memberCount || 0), 0);
  const allCfgs = await setupStore.getAll();
  const paidAdsGuilds = allCfgs.filter(c => c.allowPaidAds).map(c => c.guild_id);
  const paidAdsMembers = client.guilds.cache.filter(g => paidAdsGuilds.includes(g.id)).reduce((sum, g) => sum + (g.memberCount || 0), 0);

  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('🤖 Bot Status')
    .addFields(
      { name: '⏱️ Uptime', value: uptimeStr, inline: true },
      { name: '🏓 Ping', value: `${ping}ms`, inline: true },
      { name: '🧠 Memory', value: `${memMB} MB`, inline: true },
      { name: '🌐 Guilds', value: `${guildCount}`, inline: true },
      { name: '👥 Members (all servers)', value: totalMembers.toLocaleString(), inline: true },
      { name: '📦 Node.js', value: process.version, inline: true },
      { name: '🤝 Total Partnerships', value: `${totalPartnerships ?? 0}`, inline: true },
      { name: '📣 Paid Ads Enabled', value: `${paidAdsGuilds.length} servers\n(${paidAdsMembers.toLocaleString()} members)`, inline: true },
    )
    .setTimestamp();

  return interaction.editReply({ embeds: [embed], components: [] });
}

async function handleGuilds(client, interaction) {
  const guilds = [...client.guilds.cache.values()].sort((a, b) => b.memberCount - a.memberCount);
  const lines = guilds.map((g, i) => `\`${String(i + 1).padStart(2, '0')}.\` **${g.name}** — ${g.memberCount} members \`${g.id}\``);
  const page = lines.slice(0, 15).join('\n') || 'No guilds found.';
  const more = guilds.length > 15 ? `\n...and ${guilds.length - 15} more` : '';

  const embed = new EmbedBuilder().setColor(0x57F287).setTitle(`🌐 Guilds (${guilds.length})`).setDescription(page + more).setTimestamp();
  return interaction.editReply({ embeds: [embed], components: [] });
}

async function handleAutowave(client, interaction) {
  const guilds = [...client.guilds.cache.values()];
  const enrolled = [], missing = [];
  for (const guild of guilds) {
    const cfg = await setupStore.get(guild.id);
    if (cfg.partnerChannelId && cfg.adChannelId && cfg.logChannelId && cfg.memberRoleId && cfg.partnerPingRoleId && cfg.partnerDelayHours) {
      enrolled.push(`✅ **${guild.name}** — delay: ${cfg.partnerDelayHours ?? 24}h | members: ${guild.memberCount}`);
    } else {
      const what = [];
      if (!cfg.partnerChannelId) what.push('partner_channel');
      if (!cfg.adChannelId) what.push('ad_channel');
      if (!cfg.logChannelId) what.push('log_channel');
      if (!cfg.memberRoleId) what.push('member_role');
      if (!cfg.partnerPingRoleId) what.push('ping_role');
      if (!cfg.partnerDelayHours) what.push('delay_hours');
      missing.push(`❌ **${guild.name}** — missing: \`${what.join(', ')}\``);
    }
  }
  const desc = [enrolled.length ? `**Enrolled (${enrolled.length})**\n${enrolled.join('\n')}` : null, missing.length ? `\n**Not Configured (${missing.length})**\n${missing.join('\n')}` : null].filter(Boolean).join('\n') || 'No guilds found.';
  const embed = new EmbedBuilder().setColor(0xFEE75C).setTitle('🌊 Auto-Wave Enrollment').setDescription(desc.slice(0, 4000)).setTimestamp();
  return interaction.editReply({ embeds: [embed], components: [] });
}

async function handleCheck(client, interaction) {
  const allCfgs = await setupStore.getAll();
  const blacklisted = await getAllBlacklisted();
  const blacklistedIds = blacklisted.map(b => b.guild_id);

  const guildsData = [...client.guilds.cache.values()].map(g => {
    const cfg = allCfgs.find(c => c.guild_id === g.id) || {};
    const strikes = cfg.strikes ?? 0;
    let status = '✅ Clean';
    if (blacklistedIds.includes(g.id)) status = '🚫 Blacklisted';
    else if (strikes > 0) status = `⚠️ ${strikes}/3 Strikes`;
    return `**${g.name}** (\`${g.id}\`)\n> Status: ${status} | Paid Ads: ${cfg.allowPaidAds ? '✅' : '❌'} | Members: ${g.memberCount}`;
  });

  if (guildsData.length === 0) return interaction.editReply({ content: 'No guilds found.', components: [] });

  const itemsPerPage = 10;
  const totalPages = Math.ceil(guildsData.length / itemsPerPage);
  let currentPage = 0;

  const generateEmbed = (page) => new EmbedBuilder().setColor(0x5865F2).setTitle(`🔍 All Guilds Check (${guildsData.length} total)`).setDescription(guildsData.slice(page * itemsPerPage, (page + 1) * itemsPerPage).join('\n\n')).setFooter({ text: `Page ${page + 1} of ${totalPages}` }).setTimestamp();
  const generateButtons = (page) => new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('prev_check').setLabel('◀️ Prev').setStyle(ButtonStyle.Primary).setDisabled(page === 0),
    new ButtonBuilder().setCustomId('next_check').setLabel('Next ▶️').setStyle(ButtonStyle.Primary).setDisabled(page === totalPages - 1)
  );

  await interaction.editReply({ embeds: [generateEmbed(currentPage)], components: totalPages > 1 ? [generateButtons(currentPage)] : [] });

  if (totalPages > 1) {
    const msg = await interaction.fetchReply();
    const collector = msg.createMessageComponentCollector({ time: 600000 });
    collector.on('collect', async i => {
      if (i.customId === 'prev_check') currentPage--;
      else if (i.customId === 'next_check') currentPage++;
      await i.update({ embeds: [generateEmbed(currentPage)], components: [generateButtons(currentPage)] });
    });
  }
}

async function handleError(client, interaction) {
  const errors = await getRecentErrors(10);
  const total = await getErrorCount();
  if (errors.length === 0) return interaction.editReply({ content: '✅ No errors logged — all good!', components: [] });

  const lines = errors.map(e => `${`<t:${Math.floor(e.occurred_at / 1000)}:R>`} **\`${e.source}\`**${e.guild_id ? ` • guild \`${e.guild_id}\`` : ''}\n> ${e.message.slice(0, 200)}`);
  const embed = new EmbedBuilder().setColor(0xED4245).setTitle(`❌ Recent Errors (${errors.length} of ${total} stored)`).setDescription(lines.join('\n\n').slice(0, 4000)).setFooter({ text: `Showing last 10 • Max stored: 200` }).setTimestamp();
  return interaction.editReply({ embeds: [embed], components: [] });
}

async function handleBlacklistList(client, interaction) {
  const banned = await getAllBlacklisted();
  const domains = await getWhitelistedDomains();
  const bannedLines = banned.length ? banned.map(b => `🚫 **${client.guilds.cache.get(b.guild_id)?.name ?? b.guild_id}** \`${b.guild_id}\` — ${b.reason}`).join('\n') : '*None*';
  const domainLines = domains.length ? domains.map(d => `✅ \`${d}\``).join('\n') : '*None (only discord.gg links are allowed by default)*';
  
  const embed = new EmbedBuilder().setColor(0xED4245).setTitle('🚫 Blacklist & Whitelist').addFields(
    { name: `Blacklisted Guilds (${banned.length})`, value: bannedLines.slice(0, 1000), inline: false },
    { name: `Whitelisted Link Domains (${domains.length})`, value: domainLines.slice(0, 1000), inline: false },
  ).setTimestamp();
  return interaction.editReply({ embeds: [embed], components: [] });
}

async function handlePingToggle(client, interaction) {
  const current = (await setupStore.get('global')).pingEnabled ?? true;
  await setupStore.set('global', 'pingEnabled', !current);
  return interaction.editReply({ content: !current ? `✅ **Pings enabled globally.**` : `🔕 **Pings disabled globally.**`, components: [] });
}

// ─── Interaction Routers ──────────────────────────────────────────────────────

async function handleDashboardSelect(interaction) {
  const isVip = interaction.customId === 'vip_dashboard_select';
  const action = interaction.values[0];

  // Protect execution
  if (!isVip && !(await checkOwner(interaction, action))) return;
  if (isVip && !DASHBOARD_OPTIONS.find(o => o.value === action)?.vip) {
    return interaction.reply({ content: '🔒 You do not have permission to use this action.', ephemeral: true });
  }

  // No-input actions
  if (['status', 'autowave', 'check', 'error', 'blacklist-list', 'ping'].includes(action)) {
    await interaction.update({ content: `⏳ Loading ${action}...`, components: [] });
    if (action === 'status') return handleStatus(interaction.client, interaction);
    if (action === 'autowave') return handleAutowave(interaction.client, interaction);
    if (action === 'check') return handleCheck(interaction.client, interaction);
    if (action === 'error') return handleError(interaction.client, interaction);
    if (action === 'blacklist-list') return handleBlacklistList(interaction.client, interaction);
    if (action === 'ping') return handlePingToggle(interaction.client, interaction);
  }
  else if (action === 'guilds') {
    await interaction.update({ content: `⏳ Loading guilds...`, components: [] });
    return handleGuilds(interaction.client, interaction);
  }

  // Server selection actions
  if (['invite', 'leave', 'strike-add', 'strike-reset', 'blacklist-add', 'blacklist-remove'].includes(action)) {
    if (interaction.client.guilds.cache.size === 0) return interaction.reply({ content: '❌ The bot is not in any servers.', ephemeral: true });
    return interaction.update({
      content: `👇 **Select a server for ${action}:**`,
      embeds: [],
      components: [buildGuildMenu(interaction.client, `owner_server_select:${action}`)]
    });
  }

  // Modal actions
  if (action === 'broadcast') {
    const modal = new ModalBuilder().setCustomId('owner_modal:broadcast').setTitle('Broadcast Message');
    const msgInput = new TextInputBuilder().setCustomId('message').setLabel('Message content').setStyle(TextInputStyle.Paragraph).setRequired(true);
    const destInput = new TextInputBuilder().setCustomId('destination').setLabel('Destination (log or partner)').setStyle(TextInputStyle.Short).setRequired(true).setValue('log');
    modal.addComponents(new ActionRowBuilder().addComponents(msgInput), new ActionRowBuilder().addComponents(destInput));
    return interaction.showModal(modal);
  }
}

async function handleServerSelect(interaction) {
  const [_, action] = interaction.customId.split(':');
  const guildId = interaction.values[0];
  const guild = interaction.client.guilds.cache.get(guildId);
  const name = guild?.name ?? guildId;

  // Protect
  if (!(await checkOwner(interaction, action))) return;

  if (action === 'invite') {
    await interaction.update({ content: '⏳ Generating invite...', components: [] });
    if (!guild) return interaction.editReply('❌ Server not found.');
    const channel = guild.channels.cache.find(c => c.isTextBased() && guild.members.me.permissionsIn(c).has('CreateInstantInvite'));
    if (!channel) return interaction.editReply(`❌ No channel found in **${name}** where the bot can create an invite.`);
    try {
      const invite = await channel.createInvite({ maxAge: 0, maxUses: 1, reason: 'Owner requested' });
      return interaction.editReply(`🔗 **Invite for ${name}:**\n${invite.url}\n\n*Single use, never expires.*`);
    } catch (err) {
      return interaction.editReply(`❌ Failed: ${err.message}`);
    }
  }

  if (action === 'leave') {
    await interaction.update({ content: `⏳ Leaving ${name}...`, components: [] });
    if (!guild) return interaction.editReply('❌ Server not found.');
    try {
      await guild.leave();
      return interaction.editReply(`👋 Successfully left **${name}**.`);
    } catch (err) {
      return interaction.editReply(`❌ Failed: ${err.message}`);
    }
  }

  if (action === 'strike-reset') {
    await interaction.update({ content: `⏳ Resetting strikes for ${name}...`, components: [] });
    await setupStore.set(guildId, 'strikes', 0);
    return interaction.editReply(`✅ Strikes reset to **0** for **${name}**.`);
  }

  if (action === 'blacklist-remove') {
    await interaction.update({ content: `⏳ Unblacklisting ${name}...`, components: [] });
    await unblacklistGuild(guildId);
    return interaction.editReply(`✅ **${name}** has been removed from the blacklist.`);
  }

  // Requires a modal for reason
  if (action === 'strike-add' || action === 'blacklist-add') {
    const title = action === 'strike-add' ? 'Add Strike' : 'Blacklist Server';
    const modal = new ModalBuilder().setCustomId(`owner_modal:${action}:${guildId}`).setTitle(title.slice(0, 45));
    const reasonInput = new TextInputBuilder().setCustomId('reason').setLabel('Reason').setStyle(TextInputStyle.Short).setRequired(true);
    modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));
    return interaction.showModal(modal);
  }
}

async function handleModalSubmit(interaction) {
  const parts = interaction.customId.split(':');
  const action = parts[1];
  const guildId = parts[2];
  
  if (!(await checkOwner(interaction, action))) return;

  if (action === 'broadcast') {
    await interaction.deferReply({ ephemeral: true });
    const message = interaction.fields.getTextInputValue('message');
    const dest = interaction.fields.getTextInputValue('destination').toLowerCase();
    
    let sent = 0, failed = 0;
    for (const guild of interaction.client.guilds.cache.values()) {
      const cfg = await setupStore.get(guild.id);
      if (dest === 'partner') {
        if (!cfg.allowPaidAds) continue;
        const ch = cfg.partnerChannelId ? guild.channels.cache.get(cfg.partnerChannelId) : null;
        if (ch?.isTextBased()) { try { await ch.send(`📢 **[Paid Advertisement]**\n${message}`); sent++; } catch { failed++; } } else failed++;
      } else {
        const ch = cfg.logChannelId ? guild.channels.cache.get(cfg.logChannelId) : null;
        if (ch?.isTextBased()) { try { await ch.send(`📢 **[Wind Bot Broadcast]**\n${message}`); sent++; } catch { failed++; } } else failed++;
      }
    }
    return interaction.editReply(`📢 **Broadcast complete**\n✅ Sent: **${sent}** | ❌ Failed: **${failed}**`);
  }

  if (action === 'strike-add') {
    await interaction.deferReply({ ephemeral: true });
    const reason = interaction.fields.getTextInputValue('reason');
    const guild = interaction.client.guilds.cache.get(guildId);
    const name = guild?.name ?? guildId;
    const cfg = await setupStore.get(guildId);
    const newStrikes = (cfg.strikes ?? 0) + 1;
    await setupStore.set(guildId, 'strikes', newStrikes);

    if (cfg.logChannelId && guild) {
      const logChannel = guild.channels.cache.get(cfg.logChannelId);
      if (logChannel?.isTextBased()) {
        try { await logChannel.send(`⚠️ **STRIKE ${newStrikes}/3:** A strike was manually added to your server by the Wind Bot team.\n> **Reason:** ${reason}\n\n` + (newStrikes >= 3 ? `🚫 Your server has reached 3 strikes and may be permanently blacklisted.` : `If you reach 3 strikes, your server will be permanently blacklisted.`)); } catch {}
      }
    }
    const strikeBar = ['□','□','□'].map((_, i) => i < newStrikes ? '🟥' : '□').join(' ');
    const warn = newStrikes >= 3 ? '\n⚠️ **3 strikes reached** — consider blacklisting this server.' : '';
    return interaction.editReply(`⚠️ Strike **${newStrikes}/3** added to **${name}** ${strikeBar}\n> **Reason:** ${reason}${warn}`);
  }

  if (action === 'blacklist-add') {
    await interaction.deferReply({ ephemeral: true });
    const reason = interaction.fields.getTextInputValue('reason');
    let finalReason = reason;
    const guild = interaction.client.guilds.cache.get(guildId);
    if (guild) {
      try {
        const invChannel = guild.channels.cache.find(c => c.isTextBased() && guild.members.me.permissionsIn(c).has('CreateInstantInvite'));
        if (invChannel) {
          const inv = await invChannel.createInvite({ maxAge: 0, maxUses: 1, reason: 'Auto-Wave blacklist reference' });
          finalReason += ` | Invite: ${inv.url}`;
        }
      } catch {}
    }
    await blacklistGuild(guildId, finalReason);
    return interaction.editReply(`🚫 **${guild?.name ?? guildId}** has been blacklisted.\n> Reason: ${finalReason}`);
  }
}

// ─── Module exports ───────────────────────────────────────────────────────────

module.exports = {
  data: new SlashCommandBuilder()
    .setName('owner')
    .setDescription('Owner-only bot controls')
    .setDefaultMemberPermissions(0n)
    .addSubcommand(sub => sub.setName('dashboard').setDescription('Open the owner control panel')),

  async execute(interaction) {
    if (!await checkOwner(interaction, 'dashboard')) return;
    const embed = new EmbedBuilder()
      .setColor(0xED4245)
      .setTitle('👑 Owner Dashboard')
      .setDescription('Select an action from the dropdown menu below.')
      .setTimestamp();

    return interaction.reply({ embeds: [embed], components: [buildDashboardMenu(false)], ephemeral: true });
  },

  handleDashboardSelect,
  handleServerSelect,
  handleModalSubmit,
  buildDashboardMenu
};
