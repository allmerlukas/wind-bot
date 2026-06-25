/**
 * /config — Auto-Wave interactive setup wizard
 *
 * Subcommands:
 *   /config setup  — Launch the interactive wizard (all settings in one flow)
 *   /config view   — Show current config as an embed
 */

const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ChannelSelectMenuBuilder,
  RoleSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');

const setupStore = require('../utils/setupStore');

// ─── Wizard step definitions (in order) ─────────────────────────────────────
// Each step has an id, label, description, and component type.

const STEPS = [
  {
    id:          'cfg_partner_channel',
    label:       '📢 Partner Channel',
    description: 'Select the channel where **incoming** partner ads will be posted.',
    type:        'channel',
    storeKey:    'partnerChannelId',
    checkFn:     async (channel, guild) => {
      const perms = guild.members.me.permissionsIn(channel);
      const missing = [];
      if (!perms.has('ViewChannel')) missing.push('View Channel');
      if (!perms.has('SendMessages')) missing.push('Send Messages');
      if (!perms.has('EmbedLinks')) missing.push('Embed Links');
      
      if (missing.length > 0) {
        return `⚠️ The bot is missing required permissions in <#${channel.id}>:\n**${missing.join(', ')}**\n\nPlease fix the channel permissions and try again.`;
      }

      const everyonePerms = channel.permissionsFor(guild.roles.everyone);
      if (!everyonePerms || !everyonePerms.has('ViewChannel')) {
        return `⚠️ **<#${channel.id}>** is a private channel! Auto-Wave partner ads must be visible to the public. Please select a channel where \`@everyone\` can read messages.`;
      }

      return null;
    },
  },
  {
    id:          'cfg_ad_channel',
    label:       '📝 Ad Channel',
    description: 'Select the channel that contains **your server\'s own ad** (the bot reads the latest message there).',
    type:        'channel',
    storeKey:    'adChannelId',
    checkFn:     async (channel, guild) => {
      const perms = guild.members.me.permissionsIn(channel);
      const missing = [];
      if (!perms.has('ViewChannel')) missing.push('View Channel');
      if (!perms.has('ReadMessageHistory')) missing.push('Read Message History');
      
      if (missing.length > 0) {
        return `⚠️ The bot is missing required permissions in <#${channel.id}>:\n**${missing.join(', ')}**\n\nPlease fix the channel permissions and try again.`;
      }
      return null;
    },
  },
  {
    id:          'cfg_log_channel',
    label:       '📋 Log Channel',
    description: 'Select the channel where the bot will log Auto-Wave activity and errors.',
    type:        'channel',
    storeKey:    'logChannelId',
    checkFn:     async (channel, guild) => {
      const perms = guild.members.me.permissionsIn(channel);
      const missing = [];
      if (!perms.has('ViewChannel')) missing.push('View Channel');
      if (!perms.has('SendMessages')) missing.push('Send Messages');
      
      if (missing.length > 0) {
        return `⚠️ The bot is missing required permissions in <#${channel.id}>:\n**${missing.join(', ')}**\n\nPlease fix the channel permissions and try again.`;
      }
      return null;
    },
  },
  {
    id:          'cfg_member_role',
    label:       '👥 Member Role',
    description: 'Select the role held by **most** of your members (≥90%). Used as a ping for large incoming servers.',
    type:        'role',
    storeKey:    'memberRoleId',
    checkFn:     async (role, guild) => {
      const memberCount = guild.memberCount;
      const roleCount   = role.members.size;
      const pct         = memberCount > 0 ? roleCount / memberCount : 0;
      if (pct < 0.90) {
        return `❌ **${role.name}** only covers **${roleCount}** out of **${memberCount}** members (${Math.round(pct * 100)}%).\n\nThe **Member Role** must be held by ≥ 90% of your members — it should be the base role everyone receives on join.\n\n💡 If you don't have such a role, create a \`@Member\` role, assign it to everyone (including your bots), and select it here.`;
      }
      return null;
    },
  },
  {
    id:          'cfg_ping_role',
    label:       '🔔 Partner Ping Role',
    description: 'Select the role pinged when a partner ad arrives. Must cover **at least 10%** of your members.',
    type:        'role',
    storeKey:    'partnerPingRoleId',
    checkFn:     async (role, guild) => {
      const memberCount = guild.memberCount;
      const roleCount   = role.members.size;
      const pct         = memberCount > 0 ? roleCount / memberCount : 0;
      if (pct < 0.10) {
        return `❌ **${role.name}** only covers **${roleCount}** out of **${memberCount}** members (${Math.round(pct * 100)}%).\n\nThe **Partner Ping Role** must be held by ≥ 10% of your members so partner ads actually reach people.\n\n💡 If you don't have a role that big, you can give your bots this role too — or create a new \`@Partner Ping\` role and have members opt in.`;
      }
      return null;
    },
  },
  {
    id:          'cfg_delay_hours',
    label:       '⏱️ Partner Delay',
    description: 'Set the **minimum hours** between receiving two partner ads (minimum: 1 hour).',
    type:        'modal',
    storeKey:    'partnerDelayHours',
  },
  {
    id:          'cfg_memberrange',
    label:       '👥 Member Count Range (optional)',
    description: 'Only Auto-Wave with servers in this member count range. Your server must also qualify.\nFormat: `min-max` (e.g. `100-5000`). Leave blank / skip to allow any size.',
    storeKey:    'minMembers',
    type:        'modal',
    inputLabel:  'Member range (e.g. 100-5000, or leave blank)',
    inputId:     'cfg_memberrange_input',
  },
  {
    id:          'cfg_paid_ads',
    label:       '📣 Paid Advertisements',
    description: 'Allow Wind Bot to post **paid advertisements** from the network in your partner channel?\n\nThese are manually approved ads from paying customers — separate from regular Auto-Wave partners.\nYou can change this anytime by running `/config setup` again.',
    type:        'boolean',
    storeKey:    'allowPaidAds',
  },
];

// ─── Helper: build wizard step message ───────────────────────────────────────

async function buildStepMessage(guildId, stepIndex) {
  const step      = STEPS[stepIndex];
  const cfg       = await setupStore.get(guildId);
  const completed = STEPS.slice(0, stepIndex).map((s, i) => {
    const val = cfg[s.storeKey];
    let display = val ?? '*not set*';
    if (s.type === 'channel') display = val ? `<#${val}>` : '*not set*';
    if (s.type === 'role')    display = val ? `<@&${val}>` : '*not set*';
    return `${i + 1}. **${s.label}** — ${display} ✅`;
  });

  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle(`⚙️ Config Wizard — Step ${stepIndex + 1} of ${STEPS.length}`)
    .setDescription(
      (completed.length ? completed.join('\n') + '\n\n' : '') +
      `**→ ${step.label}**\n${step.description}`
    )
    .setFooter({ text: `Step ${stepIndex + 1}/${STEPS.length} • You can skip optional steps` })
    .setTimestamp();

  const rows = [];

  if (step.type === 'channel') {
    rows.push(
      new ActionRowBuilder().addComponents(
        new ChannelSelectMenuBuilder()
          .setCustomId(`${step.id}:${stepIndex}`)
          .setPlaceholder('Select a text channel…')
          .addChannelTypes(ChannelType.GuildText)
      )
    );
  } else if (step.type === 'role') {
    rows.push(
      new ActionRowBuilder().addComponents(
        new RoleSelectMenuBuilder()
          .setCustomId(`${step.id}:${stepIndex}`)
          .setPlaceholder('Select a role…')
      )
    );
  } else if (step.type === 'modal') {
    const isRangeStep = step.id === 'cfg_memberrange';
    rows.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`${step.id}:${stepIndex}`)
          .setLabel(isRangeStep ? 'Set Member Range' : 'Set Delay Hours')
          .setStyle(ButtonStyle.Primary)
          .setEmoji(isRangeStep ? '👥' : '⏱️')
      )
    );
  } else if (step.type === 'boolean') {
    rows.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`${step.id}_yes:${stepIndex}`)
          .setLabel('Yes — allow paid ads')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`${step.id}_no:${stepIndex}`)
          .setLabel('No — partners only')
          .setStyle(ButtonStyle.Danger),
      )
    );
  }

  // Skip + Done buttons
  const nav = new ActionRowBuilder();
  if (stepIndex === STEPS.length - 1) {
    nav.addComponents(
      new ButtonBuilder()
        .setCustomId(`cfg_skip:${stepIndex}`)
        .setLabel('Skip')
        .setStyle(ButtonStyle.Secondary)
    );
  }
  nav.addComponents(
    new ButtonBuilder()
      .setCustomId('cfg_done')
      .setLabel('Finish Setup')
      .setStyle(ButtonStyle.Success)
      .setEmoji('✅')
  );
  rows.push(nav);

  return { embeds: [embed], components: rows };
}

// ─── Helper: build final summary ─────────────────────────────────────────────

async function buildSummary(guildId) {
  const cfg = await setupStore.get(guildId);
  const fields = [
    { name: '📢 Partner Channel',   value: cfg.partnerChannelId  ? `<#${cfg.partnerChannelId}>`  : '`not set`', inline: true },
    { name: '📝 Ad Channel',         value: cfg.adChannelId        ? `<#${cfg.adChannelId}>`        : '`not set`', inline: true },
    { name: '📋 Log Channel',         value: cfg.logChannelId       ? `<#${cfg.logChannelId}>`       : '`not set`', inline: true },
    { name: '👥 Member Role',         value: cfg.memberRoleId       ? `<@&${cfg.memberRoleId}>`      : '`not set`', inline: true },
    { name: '🔔 Partner Ping Role',   value: cfg.partnerPingRoleId  ? `<@&${cfg.partnerPingRoleId}>` : '`not set`', inline: true },
    { name: '⏱️ Partner Delay',       value: `${cfg.partnerDelayHours ?? 24}h`,                       inline: true },
    { name: '👥 Member Range',        value: (cfg.minMembers != null && cfg.maxMembers != null) ? `${cfg.minMembers}–${cfg.maxMembers} members` : '`any size`', inline: true },
    { name: '📣 Paid Ads',           value: cfg.allowPaidAds ? '`allowed`' : '`not allowed`',                inline: true },
  ];

  const isReady = cfg.partnerChannelId && cfg.adChannelId && cfg.logChannelId && cfg.memberRoleId && cfg.partnerPingRoleId && cfg.partnerDelayHours;

  return new EmbedBuilder()
    .setColor(isReady ? 0x57F287 : 0xFEE75C)
    .setTitle('✅ Config Saved!')
    .setDescription(
      isReady
        ? '🌊 This server is now enrolled in Auto-Wave!'
        : '⚠️ Set at least `Partner Channel` and `Ad Channel` to enable Auto-Wave.'
    )
    .addFields(fields)
    .setFooter({ text: 'Auto-Wave • Run /config setup again to change anything' })
    .setTimestamp();
}

// ─── Command export ───────────────────────────────────────────────────────────

module.exports = {
  data: new SlashCommandBuilder()
    .setName('config')
    .setDescription('Configure the Auto-Wave partner system for this server')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)

    .addSubcommand(sub =>
      sub.setName('setup')
        .setDescription('Launch the interactive Auto-Wave setup wizard')
    )
    .addSubcommand(sub =>
      sub.setName('view')
        .setDescription('View the current Auto-Wave config for this server')
    )
    .addSubcommand(sub =>
      sub.setName('remove')
        .setDescription('Remove this server from the Auto-Wave system and wipe its config')
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    // ── /config view ─────────────────────────────────────────────────────────
    if (sub === 'view') {
      const cfg     = await setupStore.get(interaction.guildId);
      const isReady = cfg.partnerChannelId && cfg.adChannelId && cfg.logChannelId && cfg.memberRoleId && cfg.partnerPingRoleId && cfg.partnerDelayHours;

      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('⚙️ Auto-Wave Config')
        .setDescription(`Configuration for **${interaction.guild.name}**`)
        .addFields(
          { name: '📢 Partner Channel',   value: cfg.partnerChannelId  ? `<#${cfg.partnerChannelId}>`  : '`not set`', inline: true },
          { name: '📝 Ad Channel',         value: cfg.adChannelId        ? `<#${cfg.adChannelId}>`        : '`not set`', inline: true },
          { name: '📋 Log Channel',         value: cfg.logChannelId       ? `<#${cfg.logChannelId}>`       : '`not set`', inline: true },
          { name: '👥 Member Role',         value: cfg.memberRoleId       ? `<@&${cfg.memberRoleId}>`      : '`not set`', inline: true },
          { name: '🔔 Partner Ping Role',   value: cfg.partnerPingRoleId  ? `<@&${cfg.partnerPingRoleId}>` : '`not set`', inline: true },
          { name: '⏱️ Partner Delay',       value: `${cfg.partnerDelayHours ?? 24}h`,                       inline: true },
          { name: '👥 Member Range',        value: (cfg.minMembers != null && cfg.maxMembers != null) ? `${cfg.minMembers}–${cfg.maxMembers} members` : '`any size`', inline: true },
          { name: '📣 Paid Ads',           value: cfg.allowPaidAds ? '`allowed`' : '`not allowed`', inline: true },
          {
            name:  isReady ? '✅ Status' : '❌ Status',
            value: isReady
              ? 'This server is enrolled in Auto-Wave.'
              : 'Please complete all required steps in `/config setup` to enable Auto-Wave.',
            inline: false,
          },
        )
        .setFooter({ text: 'Auto-Wave Engine • Run /config setup to change settings' })
        .setTimestamp();

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // ── /config setup — always start from step 0 so users can fix any misclick ─
    if (sub === 'setup') {
      return interaction.reply({
        ...await buildStepMessage(interaction.guildId, 0),
        ephemeral: true,
      });
    }

    // ── /config remove ────────────────────────────────────────────────────────
    if (sub === 'remove') {
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xED4245)
            .setTitle('⚠️ Remove from Auto-Wave?')
            .setDescription(
              `This will **delete all Auto-Wave config** for **${interaction.guild.name}** and remove it from the network.\n\n` +
              `You can re-enroll anytime with \`/config setup\`.`
            )
            .setTimestamp(),
        ],
        components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId('cfg_remove_confirm')
              .setLabel('Yes, remove us')
              .setStyle(ButtonStyle.Danger)
              .setEmoji('🗑️'),
            new ButtonBuilder()
              .setCustomId('cfg_remove_cancel')
              .setLabel('Cancel')
              .setStyle(ButtonStyle.Secondary),
          ),
        ],
        ephemeral: true,
      });
    }
  },

  // ── Exported helpers for interactionCreate to call ───────────────────────────
  STEPS,
  buildStepMessage,
  buildSummary,
};
