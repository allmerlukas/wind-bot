const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getPartners, getAllPartners } = require('../utils/linkTracker');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('partners')
    .setDescription('View partner link stats')
    .addSubcommand(sub =>
      sub
        .setName('check')
        .setDescription('Check how many partners you or another user has')
        .addUserOption(opt =>
          opt
            .setName('user')
            .setDescription('The user to check (defaults to yourself)')
            .setRequired(false)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('leaderboard')
        .setDescription('Show the top 10 partner leaderboard')
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    // ── /partners check ──────────────────────────────────────────────────────
    if (sub === 'check') {
      const target = interaction.options.getUser('user') || interaction.user;
      const { totalPartners } = getPartners(target.id);
      const partnerWord = totalPartners === 1 ? 'partner' : 'partners';

      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('🔗 Partner Stats')
        .setDescription(
          `<@${target.id}> has posted **${totalPartners}** unique ${partnerWord}.`
        )
        .setThumbnail(target.displayAvatarURL({ dynamic: true }))
        .setFooter({ text: 'Oblivion Bot • Only unique daily links count' })
        .setTimestamp();

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // ── /partners leaderboard ─────────────────────────────────────────────────
    if (sub === 'leaderboard') {
      const data = getAllPartners();
      const sorted = Object.entries(data)
        .map(([id, info]) => ({ id, ...info }))
        .sort((a, b) => b.totalPartners - a.totalPartners)
        .slice(0, 10);

      if (sorted.length === 0) {
        return interaction.reply({
          content: '📭 No partners have been tracked yet!',
          ephemeral: true
        });
      }

      const medals = ['🥇', '🥈', '🥉'];
      const rows = sorted.map((entry, i) => {
        const rank = medals[i] ?? `**#${i + 1}**`;
        const count = entry.totalPartners;
        const word = count === 1 ? 'partner' : 'partners';
        return `${rank} <@${entry.id}> — **${count}** ${word}`;
      });

      const embed = new EmbedBuilder()
        .setColor(0xFFD700)
        .setTitle('🏆 Partner Leaderboard')
        .setDescription(rows.join('\n'))
        .setFooter({ text: 'Oblivion Bot • Top 10 by unique partner links' })
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }
  }
};
