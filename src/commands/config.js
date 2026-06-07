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
  },
  {
    id:          'cfg_ad_channel',
    label:       '📝 Ad Channel',
    description: 'Select the channel that contains **your server\'s own ad** (the bot reads the latest message there).',
    type:        'channel',
    storeKey:    'adChannelId',
  },
  {
    id:          'cfg_log_channel',
    label:       '📋 Log Channel',
    description: 'Select the channel where the bot will log Auto-Wave activity and errors.',
    type:        'channel',
    storeKey:    'logChannelId',
  },
  {
    id:          'cfg_member_role',
    label:       '👥 Member Role',
    description: 'Select the role held by **≥ 90%** of your members. Used as a ping for servers with 1,000+ members.',
    type:        'role',
    storeKey:    'memberRoleId',
  },
  {
    id:          'cfg_ping_role',
    label:       '🔔 Partner Ping Role',
    description: 'Select the role pinged when a partner ad arrives (must cover **≥ 10%** of members — enough people to be worth pinging).',
    type:        'role',
    storeKey:    'partnerPingRoleId',
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
    storeKey:    'minMembers', // used only for "is step complete" detection
    type:        'modal',
    inputLabel:  'Member range (e.g. 100-5000, or leave blank)',
    inputId:     'cfg_memberrange_input',
  },
];

// ─── Helper: build wizard step message ───────────────────────────────────────

function buildStepMessage(guildId, stepIndex) {
  const step      = STEPS[stepIndex];
  const cfg       = setupStore.get(guildId);
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
    // Determine button label based on which step this is
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
  }

  // Skip + Done buttons
  const nav = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`cfg_skip:${stepIndex}`)
      .setLabel('Skip')
      .setStyle(ButtonStyle.Secondary),
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

function buildSummary(guildId) {
  const cfg = setupStore.get(guildId);
  const fields = [
    { name: '📢 Partner Channel',   value: cfg.partnerChannelId  ? `<#${cfg.partnerChannelId}>`  : '`not set`', inline: true },
    { name: '📝 Ad Channel',         value: cfg.adChannelId        ? `<#${cfg.adChannelId}>`        : '`not set`', inline: true },
    { name: '📋 Log Channel',         value: cfg.logChannelId       ? `<#${cfg.logChannelId}>`       : '`not set`', inline: true },
    { name: '👥 Member Role',         value: cfg.memberRoleId       ? `<@&${cfg.memberRoleId}>`      : '`not set`', inline: true },
    { name: '🔔 Partner Ping Role',   value: cfg.partnerPingRoleId  ? `<@&${cfg.partnerPingRoleId}>` : '`not set`', inline: true },
    { name: '⏱️ Partner Delay',       value: `${cfg.partnerDelayHours ?? 24}h`,                       inline: true },
    { name: '👥 Member Range',        value: (cfg.minMembers != null && cfg.maxMembers != null) ? `${cfg.minMembers}–${cfg.maxMembers} members` : '`any size`', inline: true },
  ];

  const isReady = cfg.partnerChannelId && cfg.adChannelId;

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
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)

    .addSubcommand(sub =>
      sub.setName('setup')
        .setDescription('Launch the interactive Auto-Wave setup wizard')
    )
    .addSubcommand(sub =>
      sub.setName('view')
        .setDescription('View the current Auto-Wave config for this server')
    )
    .addSubcommand(sub =>
      sub.setName('check')
        .setDescription('(Owner only) See how many servers the bot is in and how many are enrolled')
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    // ── /config view ─────────────────────────────────────────────────────────
    if (sub === 'view') {
      const cfg     = setupStore.get(interaction.guildId);
      const isReady = cfg.partnerChannelId && cfg.adChannelId;

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
          {
            name:  isReady ? '✅ Status' : '❌ Status',
            value: isReady
              ? 'This server is enrolled in Auto-Wave.'
              : 'Set at least `Partner Channel` and `Ad Channel` to enable Auto-Wave.',
            inline: false,
          },
        )
        .setFooter({ text: 'Auto-Wave Engine • Run /config setup to change settings' })
        .setTimestamp();

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }
    // ── /config check (owner only) ──────────────────────────────────────────
    if (sub === 'check') {
      const ownerId = process.env.OWNER_ID;
      if (interaction.user.id !== ownerId) {
        return interaction.reply({ content: '\u274c This command is owner-only.', ephemeral: true });
      }

      const totalServers  = interaction.client.guilds.cache.size;
      const allConfigs    = setupStore.getAll();

      // "Has a config row" = any field was ever set
      const configuredCount = allConfigs.length;

      // "Enrolled" = has at least partnerChannelId AND adChannelId
      const enrolled = allConfigs.filter(c => c.partnerChannelId && c.adChannelId);
      const enrolledCount = enrolled.length;

      // Build a list of enrolled server names
      const enrolledLines = enrolled.map(c => {
        const guild = interaction.client.guilds.cache.get(c.guild_id);
        const name  = guild ? guild.name : `Unknown (\`${c.guild_id}\`)`;
        const delay = c.partnerDelayHours ?? 24;
        return `\u2022 **${name}** — delay: ${delay}h`;
      });

      const embed = new EmbedBuilder()
        .setColor(0x7c5cfc)
        .setTitle('\ud83d\udcca Bot Network Overview')
        .addFields(
          { name: '\ud83c\udfe0 Total Servers',       value: `**${totalServers}**`,     inline: true },
          { name: '\u2699\ufe0f Have Config Row',     value: `**${configuredCount}**`,  inline: true },
          { name: '\u2705 Enrolled in Auto-Wave',     value: `**${enrolledCount}**`,    inline: true },
          {
            name: '\ud83d\udcdd Enrolled Servers',
            value: enrolledLines.length > 0
              ? enrolledLines.join('\n').slice(0, 1024)
              : '*None yet*',
          },
        )
        .setFooter({ text: 'Enrolled = has both partner channel + ad channel set' })
        .setTimestamp();

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }


    // ── /config setup — resume from first unconfigured step ───────────────────
    if (sub === 'setup') {
      const cfg = setupStore.get(interaction.guildId);

      // Find the first step that has no value yet
      let startStep = STEPS.findIndex(s => {
        const val = cfg[s.storeKey];
        return val === null || val === undefined;
      });

      // Everything already filled — restart from 0 so user can change anything
      if (startStep === -1) startStep = 0;

      return interaction.reply({
        ...buildStepMessage(interaction.guildId, startStep),
        ephemeral: true,
      });
    }
  },

  // ── Exported helpers for interactionCreate to call ───────────────────────────
  STEPS,
  buildStepMessage,
  buildSummary,
};
