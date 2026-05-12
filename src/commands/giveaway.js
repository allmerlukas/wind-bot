const { SlashCommandBuilder, PermissionFlagsBits, ApplicationIntegrationType, InteractionContextType } = require('discord.js');
const {
  parseDuration,
  buildGiveawayEmbed,
  createGiveaway,
  endGiveaway,
} = require('../utils/giveawayManager');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('bcreate')
    .setDescription('Create a giveaway in this channel')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .setIntegrationTypes([ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall])
    .setContexts([InteractionContextType.Guild, InteractionContextType.PrivateChannel])
    .addStringOption(opt =>
      opt
        .setName('duration')
        .setDescription('How long the giveaway lasts — e.g. 30m, 1h, 2h30m, 1d')
        .setRequired(true)
    )
    .addStringOption(opt =>
      opt
        .setName('prize')
        .setDescription('What is being given away')
        .setRequired(true)
    )
    .addIntegerOption(opt =>
      opt
        .setName('winners')
        .setDescription('How many people can win')
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(20)
    )
    .addStringOption(opt =>
      opt
        .setName('description')
        .setDescription('Extra details or requirements for the giveaway')
        .setRequired(false)
    ),

  async execute(interaction) {
    const durationStr = interaction.options.getString('duration');
    const prize      = interaction.options.getString('prize');
    const winnersCount = interaction.options.getInteger('winners');
    const description  = interaction.options.getString('description') ?? '';

    // Validate duration
    const durationMs = parseDuration(durationStr);
    if (!durationMs) {
      return interaction.reply({
        content: [
          '❌ **Invalid duration format.**',
          'Use combinations of `d`, `h`, `m`, `s`. Examples:',
          '• `30m` — 30 minutes',
          '• `1h` — 1 hour',
          '• `2h30m` — 2 hours 30 minutes',
          '• `1d` — 1 day',
        ].join('\n'),
        ephemeral: true,
      });
    }

    const endsAt = Date.now() + durationMs;

    const giveawayData = {
      messageId: null, // set after the message is sent
      channelId: interaction.channelId,
      guildId: interaction.guildId,
      prize,
      winnersCount,
      description,
      endsAt,
      hostId: interaction.user.id,
    };

    // Reply ephemerally so the command invocation is silent
    await interaction.reply({ content: '✅ Giveaway started!', ephemeral: true });

    // Guard: bot needs channel access to post the embed
    if (!interaction.channel) {
      return interaction.editReply({
        content: '❌ I can\'t post a giveaway here — the bot must be **invited to this server** as a guild bot to access the channel.\nAsk an admin to invite it with the full bot link.',
      });
    }

    // Post the giveaway embed
    const embed = buildGiveawayEmbed(giveawayData);
    const msg = await interaction.channel.send({ embeds: [embed] });
    await msg.react('🎉');

    // Store with the real message ID
    giveawayData.messageId = msg.id;
    createGiveaway(giveawayData);

    // Schedule the end
    setTimeout(() => endGiveaway(msg.id, interaction.client), durationMs);
  },
};
