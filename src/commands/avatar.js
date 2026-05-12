const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('avatar')
    .setDescription('Show a user\'s avatar')
    .addUserOption(opt =>
      opt.setName('user').setDescription('User to get avatar for (defaults to you)').setRequired(false)
    ),

  async execute(interaction) {
    const user = interaction.options.getUser('user') ?? interaction.user;

    const avatarUrl = user.displayAvatarURL({ size: 1024, extension: 'png' });
    const gifUrl = user.displayAvatarURL({ size: 1024, extension: 'gif' });

    const embed = new EmbedBuilder()
      .setColor('#5865F2')
      .setTitle(`🖼️ ${user.tag}'s Avatar`)
      .setImage(user.avatar?.startsWith('a_') ? gifUrl : avatarUrl)
      .addFields({ name: '🔗 Links', value: `[PNG](${avatarUrl}) | [GIF](${gifUrl})`, inline: false })
      .setFooter({ text: `Requested by ${interaction.user.tag}` });

    return interaction.reply({ embeds: [embed] });
  },
};
