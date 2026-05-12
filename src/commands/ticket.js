const {
  SlashCommandBuilder, PermissionFlagsBits,
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ChannelType, PermissionsBitField,
} = require('discord.js');
const ticketStore = require('../utils/ticketStore');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('Ticket system management')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    // ── setup ──
    .addSubcommand(sub =>
      sub.setName('setup')
        .setDescription('Post a ticket panel in this channel')
        .addRoleOption(opt =>
          opt.setName('support').setDescription('Support role that can see all tickets').setRequired(true)
        )
        .addStringOption(opt =>
          opt.setName('title').setDescription('Panel title').setRequired(false)
        )
        .addStringOption(opt =>
          opt.setName('description').setDescription('Panel description').setRequired(false)
        )
        .addChannelOption(opt =>
          opt.setName('category').setDescription('Category to create ticket channels in').setRequired(false)
            .addChannelTypes(ChannelType.GuildCategory)
        )
    )
    // ── close ──
    .addSubcommand(sub =>
      sub.setName('close')
        .setDescription('Close the current ticket')
        .addStringOption(opt =>
          opt.setName('reason').setDescription('Reason for closing').setRequired(false)
        )
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    // ── /ticket setup ─────────────────────────────────────────────────────────
    if (sub === 'setup') {
      const supportRole = interaction.options.getRole('support');
      const category    = interaction.options.getChannel('category');
      const title       = interaction.options.getString('title')       ?? '🎫 Support Tickets';
      const description = interaction.options.getString('description') ?? 'Click the button below to open a support ticket.';

      ticketStore.setConfig(interaction.guildId, {
        supportRoleId: supportRole.id,
        categoryId: category?.id ?? null,
        logChannelId: null,
      });

      const embed = new EmbedBuilder()
        .setColor('#5865F2')
        .setTitle(title)
        .setDescription(description)
        .setFooter({ text: interaction.guild.name })
        .setTimestamp();

      const button = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('ticket_open')
          .setLabel('Open a Ticket')
          .setStyle(ButtonStyle.Primary)
          .setEmoji('🎫')
      );

      await interaction.channel.send({ embeds: [embed], components: [button] });
      return interaction.reply({ content: '✅ Ticket panel posted!', ephemeral: true });
    }

    // ── /ticket close ─────────────────────────────────────────────────────────
    if (sub === 'close') {
      const ticket = ticketStore.getTicket(interaction.channelId);
      if (!ticket) {
        return interaction.reply({ content: '❌ This is not a ticket channel.', ephemeral: true });
      }

      const config = ticketStore.getConfig(interaction.guildId);
      const isStaff = config && interaction.member.roles.cache.has(config.supportRoleId);
      const isOwner = ticket.userId === interaction.user.id;

      if (!isStaff && !isOwner) {
        return interaction.reply({ content: '❌ Only the ticket owner or support staff can close this.', ephemeral: true });
      }

      const reason = interaction.options.getString('reason') ?? 'No reason provided';
      await interaction.reply(`🔒 Closing ticket in 5 seconds...\n**Reason:** ${reason}`);
      setTimeout(async () => {
        ticketStore.removeTicket(interaction.channelId);
        await interaction.channel.delete().catch(() => {});
      }, 5000);
    }
  },
};
