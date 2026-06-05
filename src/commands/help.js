/**
 * /help — Comprehensive help command
 *
 * Shows categorized command documentation via a select menu.
 * Categories: Wave, Partner, Auto-Wave Setup, Moderation, Tickets, Admin/Owner
 */

const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} = require('discord.js');

// ─── Category definitions ─────────────────────────────────────────────────────

const CATEGORIES = {
  wave: {
    label: '🌊 Wave System',
    description: 'Store and send server ads in bulk',
    emoji: '🌊',
    color: 0x5865F2,
    fields: [
      {
        name: '/wave create `name`',
        value: 'Create a new wave folder to store ads in.',
      },
      {
        name: '/wave add `name`',
        value: 'Add an ad (text) to an existing wave folder.',
      },
      {
        name: '/wave remove `name` `number`',
        value: 'Remove a specific ad by number from a wave folder.',
      },
      {
        name: '/wave list',
        value: 'List all your wave folders.',
      },
      {
        name: '/wave view `name`',
        value: 'View all ads stored in a wave folder.',
      },
      {
        name: '/wave paste `name`',
        value: 'Send all ads in a wave to the current channel (8s delay each).',
      },
      {
        name: '/wave dm `name`',
        value: 'DM yourself all ads in a wave folder.',
      },
      {
        name: '/wave copy `name`',
        value: 'Paginate through ads one chunk at a time to copy-paste manually.',
      },
      {
        name: '/wave delete `name`',
        value: 'Delete an entire wave folder.',
      },
      {
        name: '/wave rename `name` `newname`',
        value: 'Rename a wave folder.',
      },
    ],
  },

  partner: {
    label: '🤝 Partner Manager',
    description: 'Manage and randomise your server partnerships',
    emoji: '🤝',
    color: 0x7c5cfc,
    fields: [
      {
        name: '/partner setup `guild_id` `channel_id` `[label]`',
        value: 'Register the first server you manage partnerships for. `channel_id` = the partner channel **in that server** where you post ads.',
      },
      {
        name: '/partner add `guild_id` `channel_id` `[label]`',
        value: 'Add another server to your partner list.',
      },
      {
        name: '/partner remove `guild_id`',
        value: 'Remove a server from your partner list.',
      },
      {
        name: '/partner list',
        value: 'View all servers in your partner list.',
      },
      {
        name: '/partner edit',
        value: 'Pick a server from a dropdown to edit its channel ID or label.',
      },
      {
        name: '/partner read `guild_id` `[channel_id]`',
        value: 'Fetch the latest ad from a registered server\'s ad channel. Provide `channel_id` once to save it — the bot remembers it for next time.',
      },
      {
        name: '/partner random',
        value: 'Pick 2 random servers from your list that haven\'t been partnered in **2 days**. Shows jump links + **Get Ads** button to DM you both ads.',
      },
      {
        name: '/partner wave',
        value: 'Pair **all** your servers together at once. If there\'s an odd number you choose which server gets 2 partnerships. Sends all ads to your DMs.',
      },
    ],
  },

  autowave: {
    label: '⚙️ Auto-Wave Setup',
    description: 'Configure automatic partner waves for your server',
    emoji: '⚙️',
    color: 0x57F287,
    fields: [
      {
        name: 'What is Auto-Wave?',
        value: 'Auto-Wave automatically pairs your server with another server every few hours and sends each other\'s ads to your partner channels — fully hands-free.',
      },
      {
        name: '/config setup',
        value: 'Launch the interactive setup wizard. Sets your partner channel, ad channel, log channel, ping roles and partner delay.',
      },
      {
        name: '/config view',
        value: 'View the current Auto-Wave configuration for this server.',
      },
      {
        name: '/config check',
        value: '*(Owner only)* See how many servers the bot is in and how many are enrolled in Auto-Wave.',
      },
      {
        name: 'Requirements to enroll',
        value: '• **Partner Channel** — where incoming partner ads get posted\n• **Ad Channel** — where your own server ad lives (bot reads it automatically)\n• Both must be set for Auto-Wave to activate',
      },
      {
        name: 'Cooldown',
        value: 'Each server pair has a **3-day cooldown** — the same two servers won\'t be matched again for 3 days.',
      },
    ],
  },

  moderation: {
    label: '🔨 Moderation',
    description: 'Server moderation tools',
    emoji: '🔨',
    color: 0xED4245,
    fields: [
      { name: '/ban `user` `[reason]`',           value: 'Ban a member from the server.' },
      { name: '/unban `user_id`',                  value: 'Unban a previously banned user.' },
      { name: '/kick `user` `[reason]`',           value: 'Kick a member from the server.' },
      { name: '/timeout `user` `duration` `[reason]`', value: 'Timeout a member (mute them temporarily).' },
      { name: '/purge `amount`',                   value: 'Delete up to 100 messages in the current channel.' },
      { name: '/lock `[channel]`',                 value: 'Lock a channel so members can\'t send messages.' },
      { name: '/slowmode `seconds`',               value: 'Set slowmode on the current channel.' },
      { name: '/role `add/remove` `user` `role`',  value: 'Add or remove a role from a member.' },
      { name: '/warn `user` `reason`',             value: 'Issue a warning to a member (logged).' },
      { name: '/brig `user` `[duration]`',         value: 'Put a user in the brig (isolated channel).' },
      { name: '/bend `user`',                      value: 'Release a user from the brig.' },
    ],
  },

  utility: {
    label: '🛠️ Utility & Info',
    description: 'General utility commands',
    emoji: '🛠️',
    color: 0xFEE75C,
    fields: [
      { name: '/ping',                  value: 'Check the bot\'s latency.' },
      { name: '/userinfo `[user]`',     value: 'View info about yourself or another user.' },
      { name: '/serverinfo',            value: 'View information about this server.' },
      { name: '/avatar `[user]`',       value: 'View a user\'s avatar in full size.' },
      { name: '/announce `message`',    value: 'Send an announcement embed to a channel.' },
      { name: '/poll `question`',       value: 'Create a poll with up to 4 options.' },
      { name: '/credits',               value: 'View Oblivion\'s credits and version.' },
    ],
  },

  tickets: {
    label: '🎫 Tickets',
    description: 'Ticket system for support',
    emoji: '🎫',
    color: 0x00b0f4,
    fields: [
      {
        name: '/ticket setup',
        value: 'Set up the ticket system — choose a category and support role, then create the panel.',
      },
      {
        name: 'Opening a ticket',
        value: 'Users click the **Open Ticket** button in the ticket panel to open a private support channel.',
      },
      {
        name: 'Closing a ticket',
        value: 'Support staff can close tickets using the **Close** button inside the ticket channel.',
      },
      {
        name: '/setup `[option]`',
        value: 'Server setup wizard — configure welcome messages, auto-role, and other server settings.',
      },
    ],
  },

  owner: {
    label: '👑 Owner Commands',
    description: 'Bot owner / network admin tools',
    emoji: '👑',
    color: 0xf1c40f,
    fields: [
      {
        name: '/owner blacklist add `guild_id`',
        value: 'Permanently ban a server from the Auto-Wave network.',
      },
      {
        name: '/owner blacklist remove `guild_id`',
        value: 'Remove a server from the blacklist.',
      },
      {
        name: '/owner blacklist list',
        value: 'View all blacklisted servers.',
      },
      {
        name: '/owner whitelist add `domain`',
        value: 'Allow a non-Discord domain to appear in ads (e.g. `twitch.tv`).',
      },
      {
        name: '/owner whitelist remove `domain`',
        value: 'Remove a domain from the whitelist.',
      },
      {
        name: '/owner whitelist list',
        value: 'View all whitelisted domains.',
      },
      {
        name: '/config check',
        value: 'View network stats — total servers, config rows, and enrolled servers.',
      },
    ],
  },
};

// ─── Build overview embed ─────────────────────────────────────────────────────

function buildOverview() {
  return new EmbedBuilder()
    .setColor(0x7c5cfc)
    .setTitle('📖 Oblivion — Command Help')
    .setDescription(
      'Select a category below to see detailed command information.\n\n' +
      Object.values(CATEGORIES).map(c => `${c.emoji} **${c.label.replace(/^. /, '')}** — ${c.description}`).join('\n')
    )
    .setFooter({ text: 'Oblivion Bot • Use the menu below to navigate' })
    .setTimestamp();
}

// ─── Build category embed ─────────────────────────────────────────────────────

function buildCategoryEmbed(key) {
  const cat = CATEGORIES[key];
  return new EmbedBuilder()
    .setColor(cat.color)
    .setTitle(`${cat.emoji} ${cat.label.replace(/^. /, '')}`)
    .setDescription(cat.description)
    .addFields(cat.fields.map(f => ({ name: f.name, value: f.value, inline: false })))
    .setFooter({ text: 'Oblivion Bot • /help for overview' })
    .setTimestamp();
}

// ─── Build select menu ────────────────────────────────────────────────────────

function buildMenu(userId) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`help_category:${userId}`)
      .setPlaceholder('Choose a category...')
      .addOptions(
        Object.entries(CATEGORIES).map(([key, cat]) =>
          new StringSelectMenuOptionBuilder()
            .setLabel(cat.label)
            .setDescription(cat.description)
            .setValue(key)
            .setEmoji(cat.emoji)
        )
      )
  );
}

// ─── Command ──────────────────────────────────────────────────────────────────

module.exports = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('View all Oblivion commands and how to use them'),

  async execute(interaction) {
    return interaction.reply({
      embeds: [buildOverview()],
      components: [buildMenu(interaction.user.id)],
      ephemeral: true,
    });
  },

  // ─── Select menu handler (called from interactionCreate) ──────────────────

  async handleSelect(interaction) {
    const key = interaction.values[0];
    if (!CATEGORIES[key]) return;
    return interaction.update({
      embeds: [buildCategoryEmbed(key)],
      components: [buildMenu(interaction.user.id)],
    });
  },

  CATEGORIES,
  buildOverview,
  buildCategoryEmbed,
};
