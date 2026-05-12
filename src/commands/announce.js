const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('announce')
    .setDescription('Send a rich announcement embed to a channel')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addChannelOption(opt =>
      opt.setName('channel').setDescription('Channel to send the announcement in').setRequired(true)
    )
    .addStringOption(opt =>
      opt.setName('title').setDescription('Announcement title').setRequired(true)
    )
    .addStringOption(opt =>
      opt.setName('message').setDescription('Announcement body').setRequired(true)
    )
    .addRoleOption(opt =>
      opt.setName('ping').setDescription('Role to ping (optional)').setRequired(false)
    )
    .addStringOption(opt =>
      opt.setName('color').setDescription('Embed color hex (e.g. #FF6B6B)').setRequired(false)
    ),

  async execute(interaction) {
    const channel = interaction.options.getChannel('channel');
    const title   = interaction.options.getString('title');
    const message = interaction.options.getString('message');
    const ping    = interaction.options.getRole('ping');
    const color   = interaction.options.getString('color') ?? '#5865F2';

    const parsedColor = /^#[0-9A-Fa-f]{6}$/.test(color) ? color : '#5865F2';

    const embed = new EmbedBuilder()
      .setColor(parsedColor)
      .setTitle(`📢 ${title}`)
      .setDescription(message)
      .setFooter({ text: `Announced by ${interaction.user.tag}` })
      .setTimestamp();

    const content = ping ? `<@&${ping.id}>` : undefined;
    await channel.send({ content, embeds: [embed] });

    return interaction.reply({ content: `✅ Announcement sent to <#${channel.id}>.`, ephemeral: true });
  },
};
