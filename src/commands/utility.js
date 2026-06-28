const {
  SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
  UserSelectMenuBuilder, PermissionFlagsBits, ApplicationIntegrationType
} = require('discord.js');

// ─── Menu Builders ────────────────────────────────────────────────────────────

function buildUtilityDashboardMenu() {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('utility_dashboard_select')
      .setPlaceholder('Select a utility...')
      .addOptions(
        new StringSelectMenuOptionBuilder().setLabel('Server Info').setValue('serverinfo').setDescription('Show information about this server').setEmoji('🏠'),
        new StringSelectMenuOptionBuilder().setLabel('Credits').setValue('credits').setDescription('Show who made the bot').setEmoji('❤️'),
        new StringSelectMenuOptionBuilder().setLabel('User Info').setValue('userinfo').setDescription('Look up a member in this server').setEmoji('👤'),
        new StringSelectMenuOptionBuilder().setLabel('Avatar').setValue('avatar').setDescription('View a member\'s avatar').setEmoji('🖼️')
      )
  );
}

function buildUtilityUserMenu(action) {
  return new ActionRowBuilder().addComponents(
    new UserSelectMenuBuilder()
      .setCustomId(`utility_user_select:${action}`)
      .setPlaceholder('Select a user...')
      .setMaxValues(1)
  );
}

// ─── Logic Handlers ───────────────────────────────────────────────────────────

async function handleDashboardSelect(interaction) {
  const action = interaction.values[0];

  if (action === 'serverinfo') {
    const guild = interaction.guild;
    if (!guild) return interaction.reply({ content: '❌ This command can only be used in a server.', ephemeral: true });
    
    await guild.members.fetch().catch(() => {});
    const owner = await guild.fetchOwner().catch(() => null);
    const createdAt = `<t:${Math.floor(guild.createdTimestamp / 1000)}:D> (<t:${Math.floor(guild.createdTimestamp / 1000)}:R>)`;

    const verificationLevels = ['None', 'Low', 'Medium', 'High', 'Very High'];
    const boostTier = guild.premiumTier ? `Level ${guild.premiumTier}` : 'No boost';

    const embed = new EmbedBuilder()
      .setColor('#5865F2')
      .setTitle(`🏠 ${guild.name}`)
      .setThumbnail(guild.iconURL({ size: 256 }) ?? null)
      .addFields(
        { name: '🆔 Server ID', value: guild.id, inline: true },
        { name: '👑 Owner', value: owner ? `<@${owner.id}>` : 'Unknown', inline: true },
        { name: '📅 Created', value: createdAt, inline: false },
        { name: '👥 Members', value: `${guild.memberCount}`, inline: true },
        { name: '📢 Channels', value: `${guild.channels.cache.size}`, inline: true },
        { name: '😀 Emojis', value: `${guild.emojis.cache.size}`, inline: true },
        { name: '🚀 Boost', value: `${boostTier} (${guild.premiumSubscriptionCount} boosts)`, inline: true },
        { name: '🔒 Verification', value: verificationLevels[guild.verificationLevel] ?? 'Unknown', inline: true },
      )
      .setFooter({ text: `Requested by ${interaction.user.tag}` })
      .setTimestamp();

    return interaction.update({ embeds: [embed], components: [] });
  }

  if (action === 'credits') {
    const embed = new EmbedBuilder()
      .setColor('#FEE75C')
      .setTitle('❤️ Wind Bot Credits')
      .setDescription(
        'Wind Bot was built with passion to help Discord servers grow their communities automatically.\n\n' +
        '**Lead Developer & Creator**\n' +
        '`[Placeholder for Developer Name/Socials]`\n\n' +
        '**Contributors & Special Thanks**\n' +
        'Thank you to everyone who tested and provided feedback!'
      )
      .setFooter({ text: 'Powered by Discord.js' })
      .setTimestamp();
    return interaction.update({ embeds: [embed], components: [] });
  }

  if (action === 'userinfo' || action === 'avatar') {
    return interaction.update({
      content: `👇 **Select a user for ${action === 'userinfo' ? 'User Info' : 'Avatar'}:**`,
      embeds: [],
      components: [buildUtilityUserMenu(action)]
    });
  }
}

async function handleUserSelect(interaction) {
  const [_, action] = interaction.customId.split(':');
  const userId = interaction.values[0];
  
  if (action === 'avatar') {
    const user = await interaction.client.users.fetch(userId).catch(() => null);
    if (!user) return interaction.update({ content: '❌ User not found.', components: [] });

    const avatarUrl = user.displayAvatarURL({ size: 1024, extension: 'png' });
    const gifUrl = user.displayAvatarURL({ size: 1024, extension: 'gif' });

    const embed = new EmbedBuilder()
      .setColor('#5865F2')
      .setTitle(`🖼️ ${user.tag}'s Avatar`)
      .setImage(user.avatar?.startsWith('a_') ? gifUrl : avatarUrl)
      .addFields({ name: '🔗 Links', value: `[PNG](${avatarUrl}) | [GIF](${gifUrl})`, inline: false })
      .setFooter({ text: `Requested by ${interaction.user.tag}` });

    return interaction.update({ content: '', embeds: [embed], components: [] });
  }

  if (action === 'userinfo') {
    const guild = interaction.guild;
    if (!guild) return interaction.update({ content: '❌ User info requires being in a server context.', components: [] });

    const target = await guild.members.fetch(userId).catch(() => null);
    if (!target) return interaction.update({ content: '❌ Member not found in this server.', components: [] });
    const user = target.user;

    const joinedServer = target.joinedTimestamp
      ? `<t:${Math.floor(target.joinedTimestamp / 1000)}:D> (<t:${Math.floor(target.joinedTimestamp / 1000)}:R>)`
      : 'Unknown';

    const createdAt = `<t:${Math.floor(user.createdTimestamp / 1000)}:D> (<t:${Math.floor(user.createdTimestamp / 1000)}:R>)`;

    const roles = target.roles?.cache
      .filter(r => r.id !== interaction.guild.id)
      .sort((a, b) => b.position - a.position)
      .map(r => `<@&${r.id}>`)
      .join(', ') || 'None';

    const embed = new EmbedBuilder()
      .setColor(target.displayHexColor ?? '#5865F2')
      .setTitle(`👤 ${user.tag}`)
      .setThumbnail(user.displayAvatarURL({ size: 256 }))
      .addFields(
        { name: '🆔 User ID', value: user.id, inline: true },
        { name: '🤖 Bot?', value: user.bot ? 'Yes' : 'No', inline: true },
        { name: '📅 Account Created', value: createdAt, inline: false },
        { name: '📥 Joined Server', value: joinedServer, inline: false },
        { name: `🏷️ Roles (${(target.roles?.cache.size ?? 1) - 1})`, value: roles.slice(0, 1024), inline: false },
      )
      .setFooter({ text: `Requested by ${interaction.user.tag}` })
      .setTimestamp();

    return interaction.update({ content: '', embeds: [embed], components: [] });
  }
}

// ─── Module exports ───────────────────────────────────────────────────────────

module.exports = {
  data: new SlashCommandBuilder()
    .setName('utility')
    .setDescription('General bot utilities and information')
    .setIntegrationTypes([ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall])
    .addSubcommand(sub => sub.setName('dashboard').setDescription('Open the utility dashboard')),

  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setColor('#5865F2')
      .setTitle('🛠️ Utility Dashboard')
      .setDescription('Select a utility action from the dropdown menu below.')
      .setTimestamp();

    return interaction.reply({ embeds: [embed], components: [buildUtilityDashboardMenu()], ephemeral: true });
  },

  handleDashboardSelect,
  handleUserSelect
};
