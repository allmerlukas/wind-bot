/**
 * /config — Auto-Wave configuration command
 *
 * Subcommands:
 *   /config set  <option> <value>  — Set one config key for this server
 *   /config view                   — Display current config as an embed
 */

const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ChannelType,
} = require('discord.js');

const setupStore = require('../utils/setupStore');

// ─── Option definitions (keep in sync with the choices list below) ───────────
const OPTIONS = {
  partner_channel:    { key: 'partnerChannelId',    label: 'Partner Channel',       emoji: '📢' },
  ad_channel:         { key: 'adChannelId',          label: 'Ad Channel',            emoji: '📝' },
  log_channel:        { key: 'logChannelId',         label: 'Log Channel',           emoji: '📋' },
  member_role:        { key: 'memberRoleId',          label: 'Member Role',           emoji: '👥' },
  partner_ping_role:  { key: 'partnerPingRoleId',    label: 'Partner Ping Role',     emoji: '🔔' },
  partner_delay_hours:{ key: 'partnerDelayHours',    label: 'Partner Delay (hours)', emoji: '⏱️' },
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('config')
    .setDescription('Configure the Auto-Wave partner system for this server')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)

    // ── /config set ──────────────────────────────────────────────────────────
    .addSubcommand(sub =>
      sub
        .setName('set')
        .setDescription('Set a config option for this server')
        .addStringOption(opt =>
          opt
            .setName('option')
            .setDescription('Which setting to configure')
            .setRequired(true)
            .addChoices(
              { name: '📢 partner_channel — Where incoming partner ads are posted', value: 'partner_channel'     },
              { name: '📝 ad_channel — Channel containing your server\'s ad',       value: 'ad_channel'          },
              { name: '📋 log_channel — Where the bot logs wave activity',           value: 'log_channel'         },
              { name: '👥 member_role — Role held by ≥90% of your members',         value: 'member_role'         },
              { name: '🔔 partner_ping_role — Role pinged for incoming partners',   value: 'partner_ping_role'   },
              { name: '⏱️ partner_delay_hours — Min hours between partners (≥0.5)', value: 'partner_delay_hours' },
            )
        )
        .addChannelOption(opt =>
          opt
            .setName('channel')
            .setDescription('Channel value (for partner_channel / ad_channel / log_channel)')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(false)
        )
        .addRoleOption(opt =>
          opt
            .setName('role')
            .setDescription('Role value (for member_role / partner_ping_role)')
            .setRequired(false)
        )
        .addIntegerOption(opt =>
          opt
            .setName('hours')
            .setDescription('Hours value (for partner_delay_hours, minimum 1)')
            .setMinValue(1)
            .setRequired(false)
        )
    )

    // ── /config view ─────────────────────────────────────────────────────────
    .addSubcommand(sub =>
      sub
        .setName('view')
        .setDescription('View the current Auto-Wave config for this server')
    ),

  // ───────────────────────────────────────────────────────────────────────────
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    // ── /config view ─────────────────────────────────────────────────────────
    if (sub === 'view') {
      const cfg = setupStore.get(interaction.guildId);

      const partnerCh  = cfg.partnerChannelId   ? `<#${cfg.partnerChannelId}>`   : '`not set`';
      const adCh       = cfg.adChannelId         ? `<#${cfg.adChannelId}>`         : '`not set`';
      const logCh      = cfg.logChannelId        ? `<#${cfg.logChannelId}>`        : '`not set`';
      const memberRole = cfg.memberRoleId        ? `<@&${cfg.memberRoleId}>`       : '`not set`';
      const pingRole   = cfg.partnerPingRoleId   ? `<@&${cfg.partnerPingRoleId}>` : '`not set`';
      const delay      = cfg.partnerDelayHours   ?? 24;

      // Warn if the role safety checks might fail
      const warnings = [];
      if (cfg.memberRoleId) {
        const role = interaction.guild.roles.cache.get(cfg.memberRoleId);
        if (role) {
          const pct = role.members.size / interaction.guild.memberCount;
          if (pct < 0.90)
            warnings.push(`⚠️ \`member_role\` covers only **${Math.round(pct * 100)}%** of members — needs ≥ 90% to be used for pings.`);
        }
      }
      if (cfg.partnerPingRoleId) {
        const role = interaction.guild.roles.cache.get(cfg.partnerPingRoleId);
        if (role) {
          const pct = role.members.size / interaction.guild.memberCount;
          if (pct > 0.10)
            warnings.push(`⚠️ \`partner_ping_role\` covers **${Math.round(pct * 100)}%** of members — must be ≤ 10% or it won't be used.`);
        }
      }

      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('⚙️ Auto-Wave Config')
        .setDescription(`Configuration for **${interaction.guild.name}**`)
        .addFields(
          { name: '📢 Partner Channel',       value: partnerCh,  inline: true  },
          { name: '📝 Ad Channel',             value: adCh,        inline: true  },
          { name: '📋 Log Channel',             value: logCh,       inline: true  },
          { name: '👥 Member Role',             value: memberRole,  inline: true  },
          { name: '🔔 Partner Ping Role',       value: pingRole,    inline: true  },
          { name: '⏱️ Partner Delay',           value: `${delay}h`, inline: true  },
        )
        .setFooter({ text: 'Auto-Wave Engine • Ticks every 30 min • Min cooldown 30 min' })
        .setTimestamp();

      if (warnings.length > 0) {
        embed.addFields({ name: '⚠️ Warnings', value: warnings.join('\n'), inline: false });
      }

      // Ready status
      const isReady = cfg.partnerChannelId && cfg.adChannelId;
      embed.addFields({
        name: isReady ? '✅ Status' : '❌ Status',
        value: isReady
          ? 'This server is enrolled in Auto-Wave.'
          : 'Set at least `partner_channel` and `ad_channel` to enable Auto-Wave.',
        inline: false,
      });

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // ── /config set ──────────────────────────────────────────────────────────
    if (sub === 'set') {
      const option  = interaction.options.getString('option');
      const channel = interaction.options.getChannel('channel');
      const role    = interaction.options.getRole('role');
      const hours   = interaction.options.getInteger('hours');

      const guild = interaction.guild;

      // ── partner_channel ────────────────────────────────────────────────────
      if (option === 'partner_channel') {
        if (!channel) return interaction.reply({ content: '❌ Please provide a channel.', ephemeral: true });
        setupStore.set(guild.id, 'partnerChannelId', channel.id);
        return interaction.reply({
          content: `✅ **Partner Channel** set to <#${channel.id}>.\nThe bot will post incoming partner ads here.`,
          ephemeral: true,
        });
      }

      // ── ad_channel ─────────────────────────────────────────────────────────
      if (option === 'ad_channel') {
        if (!channel) return interaction.reply({ content: '❌ Please provide a channel.', ephemeral: true });
        setupStore.set(guild.id, 'adChannelId', channel.id);
        return interaction.reply({
          content: `✅ **Ad Channel** set to <#${channel.id}>.\nThe bot will read the most recent message here as your server's ad.`,
          ephemeral: true,
        });
      }

      // ── log_channel ────────────────────────────────────────────────────────
      if (option === 'log_channel') {
        if (!channel) return interaction.reply({ content: '❌ Please provide a channel.', ephemeral: true });
        setupStore.set(guild.id, 'logChannelId', channel.id);
        return interaction.reply({
          content: `✅ **Log Channel** set to <#${channel.id}>.\nAuto-Wave activity will be logged here.`,
          ephemeral: true,
        });
      }

      // ── member_role ────────────────────────────────────────────────────────
      if (option === 'member_role') {
        if (!role) return interaction.reply({ content: '❌ Please provide a role.', ephemeral: true });

        // Safety check: must cover ≥ 90 % of members
        const pct = role.members.size / guild.memberCount;
        const pctStr = `${Math.round(pct * 100)}%`;

        if (pct < 0.90) {
          return interaction.reply({
            content: [
              `⚠️ **Role check failed.** <@&${role.id}> only covers **${pctStr}** of members in this server.`,
              `The \`member_role\` must be assigned to **≥ 90%** of members (currently ${role.members.size}/${guild.memberCount}).`,
              ``,
              `Give this role to more members, then try again.`,
            ].join('\n'),
            ephemeral: true,
          });
        }

        setupStore.set(guild.id, 'memberRoleId', role.id);
        return interaction.reply({
          content: `✅ **Member Role** set to <@&${role.id}> (${pctStr} of members — ✅ passes the 90% check).\nThis role will be pinged for servers with 1,000+ members.`,
          ephemeral: true,
        });
      }

      // ── partner_ping_role ──────────────────────────────────────────────────
      if (option === 'partner_ping_role') {
        if (!role) return interaction.reply({ content: '❌ Please provide a role.', ephemeral: true });

        // Safety check: must cover ≤ 10 % of members
        const pct = role.members.size / guild.memberCount;
        const pctStr = `${Math.round(pct * 100)}%`;

        if (pct > 0.10) {
          return interaction.reply({
            content: [
              `⚠️ **Role check failed.** <@&${role.id}> covers **${pctStr}** of members — too many.`,
              `The \`partner_ping_role\` must cover **≤ 10%** of members (currently ${role.members.size}/${guild.memberCount}).`,
              ``,
              `Use a more exclusive role (e.g. a dedicated "Partner Pings" opt-in role).`,
            ].join('\n'),
            ephemeral: true,
          });
        }

        setupStore.set(guild.id, 'partnerPingRoleId', role.id);
        return interaction.reply({
          content: `✅ **Partner Ping Role** set to <@&${role.id}> (${pctStr} of members — ✅ passes the 10% check).\nThis role will be pinged for servers with 500–999 members.`,
          ephemeral: true,
        });
      }

      // ── partner_delay_hours ────────────────────────────────────────────────
      if (option === 'partner_delay_hours') {
        if (!hours) return interaction.reply({ content: '❌ Please provide a number of hours (minimum 1).', ephemeral: true });
        // Enforce minimum 0.5 h (stored as raw hours, engine clamps to 30 min)
        const clamped = Math.max(hours, 1);
        setupStore.set(guild.id, 'partnerDelayHours', clamped);
        return interaction.reply({
          content: `✅ **Partner Delay** set to **${clamped} hour(s)**.\nThis server won't receive a new partner ad more often than every ${clamped} hour(s). (Hard minimum: 30 min)`,
          ephemeral: true,
        });
      }
    }
  },
};
