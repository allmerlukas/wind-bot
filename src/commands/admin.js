const {
  SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
  ModalBuilder, TextInputBuilder, TextInputStyle, PermissionFlagsBits, ChannelSelectMenuBuilder, ChannelType
} = require('discord.js');

// ─── Menu Builders ────────────────────────────────────────────────────────────

function buildAdminDashboardMenu() {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('admin_dashboard_select')
      .setPlaceholder('Select an admin action...')
      .addOptions(
        new StringSelectMenuOptionBuilder().setLabel('Announce').setValue('announce').setDescription('Send a rich announcement embed').setEmoji('📢'),
        new StringSelectMenuOptionBuilder().setLabel('Poll').setValue('poll').setDescription('Create a poll with up to 4 options').setEmoji('📊'),
        new StringSelectMenuOptionBuilder().setLabel('Purge').setValue('purge').setDescription('Bulk delete messages in this channel').setEmoji('🗑️')
      )
  );
}

function buildAdminChannelMenu() {
  return new ActionRowBuilder().addComponents(
    new ChannelSelectMenuBuilder()
      .setCustomId('admin_channel_select:announce')
      .setPlaceholder('Select a channel for the announcement...')
      .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
  );
}

// ─── Logic Handlers ───────────────────────────────────────────────────────────

async function handleDashboardSelect(interaction) {
  const action = interaction.values[0];

  if (action === 'announce') {
    return interaction.update({
      content: `👇 **Select the destination channel for the announcement:**`,
      embeds: [],
      components: [buildAdminChannelMenu()]
    });
  }

  if (action === 'poll') {
    const modal = new ModalBuilder().setCustomId('admin_modal:poll').setTitle('Create Poll');
    const qInput = new TextInputBuilder().setCustomId('question').setLabel('Question').setStyle(TextInputStyle.Short).setRequired(true);
    const o1Input = new TextInputBuilder().setCustomId('option1').setLabel('Option 1').setStyle(TextInputStyle.Short).setRequired(true);
    const o2Input = new TextInputBuilder().setCustomId('option2').setLabel('Option 2').setStyle(TextInputStyle.Short).setRequired(true);
    const o3Input = new TextInputBuilder().setCustomId('option3').setLabel('Option 3 (Optional)').setStyle(TextInputStyle.Short).setRequired(false);
    const o4Input = new TextInputBuilder().setCustomId('option4').setLabel('Option 4 (Optional)').setStyle(TextInputStyle.Short).setRequired(false);
    
    modal.addComponents(
      new ActionRowBuilder().addComponents(qInput),
      new ActionRowBuilder().addComponents(o1Input),
      new ActionRowBuilder().addComponents(o2Input),
      new ActionRowBuilder().addComponents(o3Input),
      new ActionRowBuilder().addComponents(o4Input)
    );
    return interaction.showModal(modal);
  }

  if (action === 'purge') {
    const modal = new ModalBuilder().setCustomId(`admin_modal:purge:${interaction.channel.id}`).setTitle('Purge Messages');
    const amountInput = new TextInputBuilder().setCustomId('amount').setLabel('Number of messages (1-100)').setStyle(TextInputStyle.Short).setRequired(true);
    const userInput = new TextInputBuilder().setCustomId('userid').setLabel('Target User ID (Optional)').setStyle(TextInputStyle.Short).setRequired(false);
    
    modal.addComponents(
      new ActionRowBuilder().addComponents(amountInput),
      new ActionRowBuilder().addComponents(userInput)
    );
    return interaction.showModal(modal);
  }
}

async function handleChannelSelect(interaction) {
  const [_, action] = interaction.customId.split(':');
  
  if (action === 'announce') {
    const channelId = interaction.values[0];
    const modal = new ModalBuilder().setCustomId(`admin_modal:announce:${channelId}`).setTitle('Announcement Details');
    
    const titleInput = new TextInputBuilder().setCustomId('title').setLabel('Title').setStyle(TextInputStyle.Short).setRequired(true);
    const messageInput = new TextInputBuilder().setCustomId('message').setLabel('Message Body').setStyle(TextInputStyle.Paragraph).setRequired(true);
    const pingInput = new TextInputBuilder().setCustomId('ping').setLabel('Ping Role ID (Optional)').setStyle(TextInputStyle.Short).setRequired(false);
    const colorInput = new TextInputBuilder().setCustomId('color').setLabel('Color Hex (Optional)').setStyle(TextInputStyle.Short).setRequired(false).setValue('#5865F2');
    
    modal.addComponents(
      new ActionRowBuilder().addComponents(titleInput),
      new ActionRowBuilder().addComponents(messageInput),
      new ActionRowBuilder().addComponents(pingInput),
      new ActionRowBuilder().addComponents(colorInput)
    );
    return interaction.showModal(modal);
  }
}

async function handleModalSubmit(interaction) {
  const parts = interaction.customId.split(':');
  const action = parts[1];

  if (action === 'poll') {
    await interaction.deferReply({ ephemeral: false }); // Polls should be public
    
    const question = interaction.fields.getTextInputValue('question');
    const options = [
      interaction.fields.getTextInputValue('option1'),
      interaction.fields.getTextInputValue('option2'),
      interaction.fields.getTextInputValue('option3'),
      interaction.fields.getTextInputValue('option4')
    ].filter(Boolean);

    const LETTERS = ['🇦','🇧','🇨','🇩'];
    const description = options.map((o, i) => `${LETTERS[i]} ${o}`).join('\n\n');

    const embed = new EmbedBuilder()
      .setColor('#5865F2')
      .setTitle(`📊 ${question}`)
      .setDescription(description)
      .setFooter({ text: `Poll by ${interaction.user.tag} • Vote by reacting!` })
      .setTimestamp();

    const msg = await interaction.editReply({ embeds: [embed] });
    for (let i = 0; i < options.length; i++) {
      await msg.react(LETTERS[i]).catch(() => {});
    }
    return;
  }

  if (action === 'purge') {
    await interaction.deferReply({ ephemeral: true });
    const channelId = parts[2];
    const channel = interaction.client.channels.cache.get(channelId) || interaction.channel;
    
    const amountStr = interaction.fields.getTextInputValue('amount');
    const userId = interaction.fields.getTextInputValue('userid');
    
    const amount = parseInt(amountStr, 10);
    if (isNaN(amount) || amount < 1 || amount > 100) {
      return interaction.editReply('❌ Amount must be a number between 1 and 100.');
    }

    let messages = await channel.messages.fetch({ limit: 100 }).catch(() => null);
    if (!messages) return interaction.editReply('❌ Could not fetch messages.');

    if (userId) {
      messages = messages.filter(m => m.author.id === userId).first(amount);
    } else {
      messages = messages.first(amount);
    }

    const twoWeeksAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;
    const deletable = Array.isArray(messages) ? messages.filter(m => m.createdTimestamp > twoWeeksAgo) : messages.filter(m => m.createdTimestamp > twoWeeksAgo);

    const deleted = await channel.bulkDelete(deletable, true).catch(() => null);
    const count = deleted?.size ?? 0;

    return interaction.editReply(`🗑️ Deleted **${count}** message(s)${userId ? ` from <@${userId}>` : ''}.`);
  }

  if (action === 'announce') {
    await interaction.deferReply({ ephemeral: true });
    const channelId = parts[2];
    const channel = interaction.client.channels.cache.get(channelId);
    if (!channel) return interaction.editReply('❌ Target channel not found.');

    const title = interaction.fields.getTextInputValue('title');
    const message = interaction.fields.getTextInputValue('message');
    const pingId = interaction.fields.getTextInputValue('ping');
    const color = interaction.fields.getTextInputValue('color');

    const parsedColor = /^#[0-9A-Fa-f]{6}$/.test(color) ? color : '#5865F2';

    const embed = new EmbedBuilder()
      .setColor(parsedColor)
      .setTitle(`📢 ${title}`)
      .setDescription(message)
      .setFooter({ text: `Announced by ${interaction.user.tag}` })
      .setTimestamp();

    const content = pingId ? `<@&${pingId}>` : undefined;
    
    try {
      await channel.send({ content, embeds: [embed] });
      return interaction.editReply(`✅ Announcement sent to <#${channel.id}>.`);
    } catch (err) {
      return interaction.editReply(`❌ Failed to send announcement to <#${channel.id}>: ${err.message}`);
    }
  }
}

// ─── Module exports ───────────────────────────────────────────────────────────

module.exports = {
  data: new SlashCommandBuilder()
    .setName('admin')
    .setDescription('Admin dashboard for server moderation and utilities')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(sub => sub.setName('dashboard').setDescription('Open the admin dashboard')),

  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setColor('#ED4245')
      .setTitle('🛡️ Admin Dashboard')
      .setDescription('Select an administrative action from the dropdown menu below.')
      .setTimestamp();

    return interaction.reply({ embeds: [embed], components: [buildAdminDashboardMenu()], ephemeral: true });
  },

  handleDashboardSelect,
  handleChannelSelect,
  handleModalSubmit
};
