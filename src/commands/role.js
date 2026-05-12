const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('role')
    .setDescription('Role management')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addSubcommand(sub =>
      sub.setName('add')
        .setDescription('Give a role to a user')
        .addUserOption(opt => opt.setName('user').setDescription('Target user').setRequired(true))
        .addRoleOption(opt => opt.setName('role').setDescription('Role to add').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('remove')
        .setDescription('Remove a role from a user')
        .addUserOption(opt => opt.setName('user').setDescription('Target user').setRequired(true))
        .addRoleOption(opt => opt.setName('role').setDescription('Role to remove').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('info')
        .setDescription('Show info about a role')
        .addRoleOption(opt => opt.setName('role').setDescription('Role to inspect').setRequired(true))
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'add') {
      const member = interaction.options.getMember('user');
      const role   = interaction.options.getRole('role');

      if (role.position >= interaction.guild.members.me.roles.highest.position) {
        return interaction.reply({ content: '❌ That role is higher than or equal to my highest role.', ephemeral: true });
      }
      if (member.roles.cache.has(role.id)) {
        return interaction.reply({ content: `❌ <@${member.id}> already has <@&${role.id}>.`, ephemeral: true });
      }

      await member.roles.add(role);
      return interaction.reply({ content: `✅ Gave <@&${role.id}> to <@${member.id}>.` });
    }

    if (sub === 'remove') {
      const member = interaction.options.getMember('user');
      const role   = interaction.options.getRole('role');

      if (!member.roles.cache.has(role.id)) {
        return interaction.reply({ content: `❌ <@${member.id}> doesn't have <@&${role.id}>.`, ephemeral: true });
      }

      await member.roles.remove(role);
      return interaction.reply({ content: `✅ Removed <@&${role.id}> from <@${member.id}>.` });
    }

    if (sub === 'info') {
      const role = interaction.options.getRole('role');
      const members = interaction.guild.members.cache.filter(m => m.roles.cache.has(role.id));
      const createdAt = `<t:${Math.floor(role.createdTimestamp / 1000)}:D>`;

      const embed = new EmbedBuilder()
        .setColor(role.hexColor)
        .setTitle(`🏷️ ${role.name}`)
        .addFields(
          { name: '🆔 Role ID', value: role.id, inline: true },
          { name: '🎨 Color', value: role.hexColor, inline: true },
          { name: '👥 Members', value: `${members.size}`, inline: true },
          { name: '📅 Created', value: createdAt, inline: true },
          { name: '📌 Hoisted', value: role.hoist ? 'Yes' : 'No', inline: true },
          { name: '🔔 Mentionable', value: role.mentionable ? 'Yes' : 'No', inline: true },
        )
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }
  },
};
