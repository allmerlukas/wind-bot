/**
 * /help — Comprehensive help command
 *
 * Shows categorized command documentation via a select menu.
 * Based on the official Wind Bot documentation.
 */

const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ApplicationIntegrationType,
  InteractionContextType,
  PermissionFlagsBits,
} = require('discord.js');

// ─── Category definitions ─────────────────────────────────────────────────────

const CATEGORIES = {
  serversetup: {
    label: '⚙️ Server Setup',
    description: 'Set up Wind Bot for your server (admin only)',
    emoji: '⚙️',
    color: 0x57F287,
    fields: [
      {
        name: 'Who can set this up?',
        value: 'A server admin with **Manage Server** permission sets everything up once.',
      },
      {
        name: '/config setup',
        value: [
          'Launches a step-by-step setup wizard:',
          '> 📢 **Partner Channel** — where incoming partner ads get posted',
          '> 📝 **Ad Channel** — the channel with your server\'s own ad',
          '> 📋 **Log Channel** — where Wind Bot logs all wave activity',
          '> 👥 **Member Role** — role held by ≥90% of your members (used for pings)',
          '> 🔔 **Partner Ping Role** — role pinged on partner arrival (needs ≥10% of members)',
          '> ⏱️ **Partner Delay** — minimum hours between receiving ads',
          '> 👥 **Member Range** — only Auto-Wave with servers in this range (e.g. `100-5000`)',
          '',
          'Once **Partner Channel** and **Ad Channel** are both set, your server is enrolled in Auto-Wave automatically.',
        ].join('\n'),
      },
      {
        name: '/config view',
        value: 'See your current config at any time — shows all settings and enrollment status.',
      },
    ],
  },

  autowave: {
    label: '🌊 Auto-Wave',
    description: 'Automatic hands-free partner ad system',
    emoji: '🌊',
    color: 0x5865F2,
    fields: [
      {
        name: 'How Auto-Wave works',
        value: [
          'Every **30 minutes** Wind Bot runs a tick:',
          '→ Reads the most recent message in your **Ad Channel** that contains a `discord.gg` link',
          '→ Sends it to another enrolled server',
          '→ Receives an ad back from a different server',
          '→ Posts it in your **Partner Channel** with the right ping',
        ].join('\n'),
      },
      {
        name: '⏱️ Cooldown',
        value: 'Wind Bot will **not** partner the same two servers again for **3 days** — no spam, no repeats.',
      },
      {
        name: '🔔 Ping Tiers',
        value: [
          'Pings are based on the receiving server\'s member count:',
          '> `< 100` members → No ping',
          '> `100–499` → @here',
          '> `500–999` → @here + Partner Ping Role',
          '> `1,000+` → Member Role',
        ].join('\n'),
      },
      {
        name: '👥 Member Range Filter',
        value: [
          'Set a range like `100-5000` in `/config setup` to only partner with servers of a similar size.',
          'Your own server\'s member count must also be within the range to qualify.',
          'Leave it blank to partner with servers of any size.',
        ].join('\n'),
      },
      {
        name: '📋 Ad Rules',
        value: [
          '> ✅ Only Discord invite links allowed (no external URLs)',
          '> ✅ All @mentions are automatically stripped before sending',
          '',
          'Your log channel will tell you if your ad was skipped and why.',
        ].join('\n'),
      },
      {
        name: '🛡️ Anti-Scam Strike System',
        value: [
          'Wind Bot monitors partner channels for deleted ads:',
          '> ⚠️ **Strike 1 & 2** — Warning sent to your log channel',
          '> 🚫 **Strike 3** — Your server is permanently blacklisted from Auto-Wave',
          '',
          'Deleting partner ads = scamming the network. Don\'t do it.',
        ].join('\n'),
      },
    ],
  },

  wave: {
    label: '📁 Wave Folders',
    description: 'Save and send partner ads in bulk',
    emoji: '📁',
    color: 0x7c5cfc,
    fields: [
      {
        name: 'What are waves?',
        value: 'Waves are your personal saved collections of partner ads. They are **private** — nobody else can see or access your folders.',
      },
      {
        name: '/wave create `name`',
        value: 'Create a new wave folder.',
      },
      {
        name: '/wave add `name`',
        value: 'Add an ad (text) to an existing wave folder.',
      },
      {
        name: '/wave remove `name` `number`',
        value: 'Remove a specific ad by its number from a folder.',
      },
      {
        name: '/wave list',
        value: 'See all your saved wave folders.',
      },
      {
        name: '/wave view `name`',
        value: 'View all ads stored in a specific folder.',
      },
      {
        name: '/wave paste `name`',
        value: 'Send all ads in a folder to the current channel with an 8-second delay between each.',
      },
      {
        name: '/wave copy `name`',
        value: 'Paginate through ads one chunk at a time to copy-paste yourself.',
      },
      {
        name: '/wave dm `name`',
        value: 'Send all ads in a folder to your DMs.',
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
    color: 0xf1c40f,
    fields: [
      {
        name: 'What is this?',
        value: 'The Partner Manager lets you register all the servers you manage partnerships for, then randomly pair them or do full waves — all tracked with a 2-day cooldown per pair.',
      },
      {
        name: '/partner setup `guild_id` `channel_id` `[label]`',
        value: 'Register your first server. `channel_id` = the partner channel **in that server** where you post ads.',
      },
      {
        name: '/partner add `guild_id` `channel_id` `[label]`',
        value: 'Add another server to your list.',
      },
      {
        name: '/partner remove `guild_id`',
        value: 'Remove a server from your list.',
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
        value: [
          'Fetch the latest ad from a registered server\'s ad channel.',
          'Provide `channel_id` once — Wind Bot saves it and remembers for next time.',
          'Falls back to your wave folders if the bot isn\'t in that server.',
        ].join('\n'),
      },
      {
        name: '/partner random',
        value: [
          'Pick 2 random servers from your list that haven\'t been partnered in the last **2 days**.',
          'Shows jump links to both partner channels + buttons:',
          '> ✅ **Mark as Partnered** — records the pair on cooldown',
          '> 📋 **Get Ads** — DMs you both ads ready to copy-paste',
          '> 🔄 **Re-roll** — picks a different pair',
        ].join('\n'),
      },
      {
        name: '/partner wave',
        value: [
          'Pairs **all** your registered servers together at once.',
          'If there\'s an odd number, you choose which server gets 2 partnerships.',
          '> 📋 **Get All Ads** — DMs you each pair\'s ads with jump links',
          '> ✅ **Mark All as Partnered** — records all pairs on 2-day cooldown',
        ].join('\n'),
      },
    ],
  },

  tracking: {
    label: '📊 Partner Tracking',
    description: 'Track partner links you post',
    emoji: '📊',
    color: 0x00b0f4,
    fields: [
      {
        name: 'How it works',
        value: 'Wind Bot automatically tracks every `discord.gg` partner link you post in any channel. Your stats are personal — nobody else can see them.',
      },
      {
        name: '/partners',
        value: 'See your personal partner stats — total partners, daily count, and your most recent links.',
      },
      {
        name: 'What Wind Bot stores',
        value: [
          '• Your Discord user ID',
          '• Your saved wave folders and partner list',
          '• Your partner link history',
          '',
          'Nothing is shared. You can ask an admin to delete your data at any time.',
        ].join('\n'),
      },
    ],
  },

  utility: {
    label: '🛠️ Utility',
    description: 'General utility and server tools',
    emoji: '🛠️',
    color: 0xFEE75C,
    fields: [
      { name: '/ping',                  value: 'Check if Wind Bot is online and its latency.' },
      { name: '/userinfo `[user]`',     value: 'View info about yourself or another user.' },
      { name: '/serverinfo',            value: 'View information about this server.' },
      { name: '/avatar `[user]`',       value: 'View a user\'s avatar in full size.' },
      { name: '/announce `message`',    value: 'Send an announcement embed to a channel.' },
      { name: '/poll `question`',       value: 'Create a poll with up to 4 options.' },
      { name: '/purge `amount`',        value: 'Delete up to 100 messages in the current channel.' },
      { name: '/stop',                  value: '*(Admin only)* Emergency stop — pauses the Auto-Wave engine immediately.' },
      { name: '/help',                  value: 'Open this help menu.' },
      { name: '/credits',               value: 'See who built Wind Bot and the inspiration behind it.' },
    ],
  },

};

// ─── Build overview embed ─────────────────────────────────────────────────────

function buildOverview() {
  return new EmbedBuilder()
    .setColor(0x7c5cfc)
    .setTitle('📖 Wind Bot — Help')
    .setDescription(
      'Select a category below to see detailed command information.\n\n' +
      Object.values(CATEGORIES).map(c => `${c.emoji} **${c.label.replace(/^\S+ /, '')}** — ${c.description}`).join('\n')
    )
    .setFooter({ text: 'Wind Bot • Use the menu below to navigate' })
    .setTimestamp();
}

// ─── Build category embed ─────────────────────────────────────────────────────

function buildCategoryEmbed(key) {
  const cat = CATEGORIES[key];
  return new EmbedBuilder()
    .setColor(cat.color)
    .setTitle(`${cat.emoji} ${cat.label.replace(/^\S+ /, '')}`)
    .setDescription(cat.description)
    .addFields(cat.fields.map(f => ({ name: f.name, value: f.value, inline: false })))
    .setFooter({ text: 'Wind Bot • /help for overview' })
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
    .setDescription('View all Wind Bot commands and how to use them')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setIntegrationTypes([
      ApplicationIntegrationType.GuildInstall,
      ApplicationIntegrationType.UserInstall,
    ])
    .setContexts([
      InteractionContextType.Guild,
      InteractionContextType.BotDM,
      InteractionContextType.PrivateChannel,
    ]),

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
