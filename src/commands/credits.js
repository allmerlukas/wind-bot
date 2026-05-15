/**
 * /credits — Public command
 * Shows credits for Oblivion bot.
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('credits')
    .setDescription('See who built Oblivion and the inspiration behind it'),

  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('✨ Oblivion — Credits')
      .setDescription(
        [
          '**Oblivion** is a custom Discord bot built for partner management, server automation, and more.',
          '',
          '👤 **Developer**',
          '> <@' + interaction.client.application.owner?.id + '> — Built and maintained Oblivion',
          '',
          '💡 **Inspiration**',
          '> **WaveBot** by **copa** — the original idea for the partner wave system',
          '',
          '🔧 **Built with**',
          '> [discord.js v14](https://discord.js.org) • [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) • Node.js',
        ].join('\n')
      )
      .setFooter({ text: 'Oblivion • Thanks for using the bot!' })
      .setTimestamp();

    return interaction.reply({ embeds: [embed] });
  },
};
