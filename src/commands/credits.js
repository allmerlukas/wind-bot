/**
 * /credits — Public command
 * Shows credits for Wind Bot.
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('credits')
    .setDescription('See who built Wind Bot and the inspiration behind it'),

  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('✨ Wind Bot — Credits')
      .setDescription(
        [
          '**Wind Bot** is a custom Discord bot built for partner management, server automation, and more.',
          '',
          '👤 **Developer**',
          '> <@' + interaction.client.application.owner?.id + '> — Built and maintained Wind Bot',
          '',
          '💡 **Inspiration**',
          '> **WaveBot** by **copa** — the original idea for the partner wave system',
          '> [Join copa\'s server](https://discord.gg/mcfdJUjHJH) to check out WaveBot',
          '',
          '🔧 **Built with**',
          '> [discord.js v14](https://discord.js.org) • [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) • Node.js',
        ].join('\n')
      )
      .setFooter({ text: 'Wind Bot • Thanks for using the bot!' })
      .setTimestamp();

    return interaction.reply({ embeds: [embed] });
  },
};
