const {
  SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder,
} = require('discord.js');
const setupStore = require('../utils/setupStore');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Server setup utilities')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    // ── welcome ──
    .addSubcommand(sub =>
      sub.setName('welcome')
        .setDescription('Set a welcome message for new members')
        .addChannelOption(opt =>
          opt.setName('channel').setDescription('Channel to send welcome messages in').setRequired(true)
        )
        .addStringOption(opt =>
          opt.setName('message')
            .setDescription('Message text — use {user}, {server}, {count}')
            .setRequired(false)
        )
    )
    // ── autorole ──
    .addSubcommand(sub =>
      sub.setName('autorole')
        .setDescription('Automatically assign a role to new members')
        .addRoleOption(opt =>
          opt.setName('role').setDescription('Role to assign — leave empty to disable').setRequired(false)
        )
    )
    // ── test ──
    .addSubcommand(sub =>
      sub.setName('test')
        .setDescription('Test the welcome message')
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'welcome') {
      const channel = interaction.options.getChannel('channel');
      const message = interaction.options.getString('message')
        ?? '👋 Welcome to **{server}**, {user}! You are member **#{count}**.';

      setupStore.set(interaction.guildId, 'welcomeChannelId', channel.id);
      setupStore.set(interaction.guildId, 'welcomeMessage', message);

      return interaction.reply({
        content: [
          `✅ Welcome messages will be sent in <#${channel.id}>.`,
          `**Message:** ${message}`,
          `> Variables: \`{user}\` \`{server}\` \`{count}\``,
        ].join('\n'),
        ephemeral: true,
      });
    }

    if (sub === 'autorole') {
      const role = interaction.options.getRole('role');
      if (!role) {
        setupStore.set(interaction.guildId, 'autoroleId', null);
        return interaction.reply({ content: '✅ Autorole disabled.', ephemeral: true });
      }
      setupStore.set(interaction.guildId, 'autoroleId', role.id);
      return interaction.reply({ content: `✅ New members will automatically receive <@&${role.id}>.`, ephemeral: true });
    }

    if (sub === 'test') {
      const cfg = setupStore.get(interaction.guildId);
      if (!cfg.welcomeChannelId) {
        return interaction.reply({ content: '❌ No welcome channel set. Use `/setup welcome` first.', ephemeral: true });
      }
      const channel = interaction.guild.channels.cache.get(cfg.welcomeChannelId);
      if (!channel) return interaction.reply({ content: '❌ Welcome channel not found.', ephemeral: true });

      const memberCount = interaction.guild.memberCount;
      const text = (cfg.welcomeMessage ?? '👋 Welcome {user} to {server}! You are member #{count}.')
        .replace(/{user}/g, `<@${interaction.user.id}>`)
        .replace(/{server}/g, interaction.guild.name)
        .replace(/{count}/g, memberCount);

      await channel.send(text);
      return interaction.reply({ content: `✅ Test welcome sent to <#${channel.id}>.`, ephemeral: true });
    }
  },
};
