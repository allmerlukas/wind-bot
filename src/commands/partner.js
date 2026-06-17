/**
 * /partner — Personal partner manager
 *
 * Subcommands:
 *   /partner setup  — Register first guild
 *   /partner add    — Add another guild
 *   /partner remove — Remove a guild
 *   /partner list   — List all guilds
 *   /partner random — Pick 2 random eligible guilds
 *   /partner wave   — Pair ALL guilds together in one session
 *                     If odd count → pick which server gets 2 partners
 */

const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionFlagsBits,
} = require('discord.js');

const pmStore     = require('../utils/pmStore');
const setupStore  = require('../utils/setupStore');
const waveStore   = require('../utils/waveStore');
const { extractInviteCodes } = require('../utils/inviteChecker');
const { stripPings }         = require('../utils/pingStripper');

// ─── Ad fetcher ───────────────────────────────────────────────────────────────
// Two-stage lookup for a guild's ad:
//   1. setupStore ad channel (when bot is in the server)
//   2. Scan the user's wave folders for an ad whose invite resolves to guildId

const INVITE_RE = /discord\.gg\/[a-zA-Z0-9-]+|discord\.com\/invite\/[a-zA-Z0-9-]+/i;

// Stage 1 — fetch from the guild's configured ad channel
async function fetchAdFromChannel(client, guildId) {
  const cfg = await setupStore.get(guildId);
  if (!cfg?.adChannelId) return null;
  try {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return null;
    const ch = guild.channels.cache.get(cfg.adChannelId);
    if (!ch?.isTextBased()) return null;
    const messages = await ch.messages.fetch({ limit: 50 });
    const adMsg    = [...messages.values()].find(m =>
      m.content?.trim().length > 0 && INVITE_RE.test(m.content)
    );
    if (!adMsg) return null;
    return stripPings(adMsg.content) || null;
  } catch { return null; }
}

// Stage 2 — scan user's waves for an ad whose invite resolves to guildId
async function findAdInWaves(client, userId, guildId) {
  const userWaves = await waveStore.getUserWaves(userId);
  const allAds    = Object.values(userWaves).flatMap(w => w.ads ?? []);

  for (const ad of allAds) {
    const codes = extractInviteCodes(ad);
    for (const code of codes) {
      try {
        const invite = await client.fetchInvite(code);
        if (invite.guild?.id === guildId) {
          return stripPings(ad);
        }
      } catch { /* dead or inaccessible — keep scanning */ }
    }
  }
  return null;
}

// Combined: try ad channel first, fall back to waves
async function fetchAdForGuild(client, userId, guildId) {
  return (await fetchAdFromChannel(client, guildId))
      ?? (await findAdInWaves(client, userId, guildId));
}

// ─── In-memory wave sessions ──────────────────────────────────────────────────
// Keyed by userId; stores finalized pairs and the leftover guild (if odd count)
// TTL: 15 minutes

const waveSessions = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [id, s] of waveSessions) {
    if (s.expiresAt < now) waveSessions.delete(id);
  }
}, 5 * 60 * 1000);

function setWaveSession(userId, data) {
  waveSessions.set(userId, { ...data, expiresAt: Date.now() + 15 * 60 * 1000 });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function guildName(g) {
  return g.label || `Guild \`${g.guild_id}\``;
}

function jumpLink(g) {
  return `https://discord.com/channels/${g.guild_id}/${g.channel_id}`;
}

// ─── Build wave summary embed ─────────────────────────────────────────────────

function buildWaveEmbed(pairs, guildsMap, extra = null, doubleGuild = null) {
  const lines = pairs.map((pair, i) => {
    const a  = guildsMap[pair[0]];
    const b  = guildsMap[pair[1]];
    const nameA = guildName(a);
    const nameB = guildName(b);
    return `**${i + 1}.** [${nameA}](${jumpLink(a)}) ↔ [${nameB}](${jumpLink(b)})`;
  });

  const embed = new EmbedBuilder()
    .setColor(0x7c5cfc)
    .setTitle(`🌊 Wave Session — ${Object.keys(guildsMap).length} servers, ${pairs.length} pair(s)`)
    .setDescription(lines.join('\n') || '*No pairs yet.*')
    .setTimestamp();

  if (extra) {
    const extraG = guildsMap[extra];
    embed.addFields({
      name: '⚠️ Leftover Server',
      value: `**${guildName(extraG)}** has no partner yet — choose which server gets the extra partnership.`,
    });
  }

  if (doubleGuild) {
    const dg = guildsMap[doubleGuild];
    embed.setFooter({ text: `${guildName(dg)} will handle 2 partnerships this wave.` });
  }

  return embed;
}

// ─── Find eligible pair for /partner random ───────────────────────────────────

async function findEligiblePair(userId, guilds) {
  const shuffled = shuffle(guilds);
  for (let i = 0; i < shuffled.length; i++) {
    for (let j = i + 1; j < shuffled.length; j++) {
      const a = shuffled[i];
      const b = shuffled[j];
      if (!await pmStore.pairedRecently(userId, a.guild_id, b.guild_id)) {
        return [a, b];
      }
    }
  }
  return null;
}

// ─── Build random match embed ─────────────────────────────────────────────────

function buildMatchEmbed(g1, g2) {
  return new EmbedBuilder()
    .setColor(0x7c5cfc)
    .setTitle('🎲 Partner Match')
    .setDescription('Post in both partner channels, then click **✅ Mark as Partnered** to record it.')
    .addFields(
      {
        name: `🏠 ${guildName(g1)}`,
        value: `📢 Partner channel: [Jump →](${jumpLink(g1)})\n\`${g1.channel_id}\``,
        inline: true,
      },
      {
        name: `🏠 ${guildName(g2)}`,
        value: `📢 Partner channel: [Jump →](${jumpLink(g2)})\n\`${g2.channel_id}\``,
        inline: true,
      },
    )
    .setFooter({ text: 'These two guilds have not been partnered in the last 2 days.' })
    .setTimestamp();
}

function buildConfirmRow(userId, guildAId, guildBId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`pm_confirm:${userId}:${guildAId}:${guildBId}`)
      .setLabel('\u2705 Mark as Partnered')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`pm_getads:${userId}:${guildAId}:${guildBId}`)
      .setLabel('\ud83d\udccb Get Ads')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`pm_reroll:${userId}`)
      .setLabel('\ud83d\udd04 Re-roll')
      .setStyle(ButtonStyle.Secondary),
  );
}

// ─── Command definition ───────────────────────────────────────────────────────

module.exports = {
  data: new SlashCommandBuilder()
    .setName('partner')
    .setDescription('Personal partner manager — track and randomise your server partnerships')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)

    .addSubcommand(sub =>
      sub.setName('setup')
        .setDescription('Register the first guild you manage partnerships for')
        .addStringOption(opt => opt.setName('guild_id').setDescription('Guild ID').setRequired(true))
        .addStringOption(opt => opt.setName('channel_id').setDescription('Partner channel ID').setRequired(true))
        .addStringOption(opt => opt.setName('label').setDescription('Nickname (optional)').setRequired(false).setMaxLength(40))
    )

    .addSubcommand(sub =>
      sub.setName('add')
        .setDescription('Add another guild to your list')
        .addStringOption(opt => opt.setName('guild_id').setDescription('Guild ID').setRequired(true))
        .addStringOption(opt => opt.setName('channel_id').setDescription('Partner channel ID').setRequired(true))
        .addStringOption(opt => opt.setName('label').setDescription('Nickname (optional)').setRequired(false).setMaxLength(40))
    )

    .addSubcommand(sub =>
      sub.setName('remove')
        .setDescription('Remove a guild from your list')
        .addStringOption(opt => opt.setName('guild_id').setDescription('Guild ID to remove').setRequired(true))
    )

    .addSubcommand(sub =>
      sub.setName('list')
        .setDescription('Show all guilds in your partner manager list')
    )

    .addSubcommand(sub =>
      sub.setName('random')
        .setDescription('Pick 2 random guilds that haven\'t partnered in 2 days')
    )

    .addSubcommand(sub =>
      sub.setName('wave')
        .setDescription('Pair ALL your guilds together in one big session')
    )

    .addSubcommand(sub =>
      sub.setName('read')
        .setDescription('Read the ad from a registered guild\'s ad channel')
        .addStringOption(opt =>
          opt.setName('guild_id')
            .setDescription('Guild ID to read the ad from')
            .setRequired(true)
        )
        .addStringOption(opt =>
          opt.setName('channel_id')
            .setDescription('Override: specific channel ID to read from (optional)')
            .setRequired(false)
        )
    )

    .addSubcommand(sub =>
      sub.setName('edit')
        .setDescription('Edit the channel ID or label of a registered guild')
    )

    .addSubcommand(sub =>
      sub.setName('reqs')
        .setDescription('Show the Auto-Wave ping requirements for this server based on its member count')
    ),

  // ─── Execute ─────────────────────────────────────────────────────────────────

  async execute(interaction) {
    const sub    = interaction.options.getSubcommand();
    const userId = interaction.user.id;

    // ── /partner reqs ─────────────────────────────────────────────────────────
    if (sub === 'reqs') {
      const n = interaction.guild?.memberCount ?? 0;

      // Build tier breakpoints based on server size
      let rows;
      if (n >= 500) {
        const t1 = Math.ceil(n * 0.38);
        const t2 = Math.ceil(n * 0.51);
        const t3 = Math.ceil(n * 0.71);
        const t4 = Math.ceil(n * 0.92);
        rows = [
          [`0 - ${t1 - 1}`,      'Nothing'],
          [`${t1} - ${t2 - 1}`,  'Partner Ping'],
          [`${t2} - ${t3 - 1}`,  '@here'],
          [`${t3} - ${t4 - 1}`,  'Partner Ping + @here'],
          [`${t4}+`,             'Member Role'],
        ];
      } else if (n >= 200) {
        const t1 = Math.ceil(n * 0.20);
        const t2 = Math.ceil(n * 0.40);
        const t3 = Math.ceil(n * 0.60);
        const t4 = Math.ceil(n * 0.90);
        rows = [
          [`0 - ${t1 - 1}`,      'Nothing'],
          [`${t1} - ${t2 - 1}`,  'Partner Ping'],
          [`${t2} - ${t3 - 1}`,  '@here'],
          [`${t3} - ${t4 - 1}`,  'Partner Ping + @here'],
          [`${t4}+`,             'Member Role'],
        ];
      } else if (n >= 50) {
        const t1 = Math.ceil(n * 0.50);
        const t2 = Math.ceil(n * 0.85);
        rows = [
          [`0 - ${t1 - 1}`,  'Partner Ping'],
          [`${t1} - ${t2 - 1}`, '@here'],
          [`${t2}+`,         'Member Role'],
        ];
      } else {
        const t1 = Math.ceil(n * 0.85);
        rows = [
          [`0 - ${t1 - 1}`, 'Partner Ping'],
          [`${t1}+`,         'Member Role'],
        ];
      }

      // Format as a fixed-width code block table
      const col1 = Math.max(...rows.map(r => r[0].length), 'Incoming members'.length);
      const header = `${'Incoming members'.padEnd(col1)}  Ping`;
      const divider = '-'.repeat(col1) + '  ' + '-'.repeat(20);
      const lines = rows.map(([range, ping]) => `${range.padEnd(col1)}  ${ping}`);

      return interaction.reply({
        content: `**Ping Requirements — ${n} members**\n\`\`\`\n${header}\n${divider}\n${lines.join('\n')}\n\`\`\``,
        ephemeral: true,
      });
    }

    // ── /partner setup & add ──────────────────────────────────────────────────
    if (sub === 'setup' || sub === 'add') {
      const guildId   = interaction.options.getString('guild_id');
      const channelId = interaction.options.getString('channel_id');
      const label     = interaction.options.getString('label') ?? null;

      if (!/^\d{17,19}$/.test(guildId))   return interaction.reply({ content: '❌ Invalid guild ID.', ephemeral: true });
      if (!/^\d{17,19}$/.test(channelId)) return interaction.reply({ content: '❌ Invalid channel ID.', ephemeral: true });

      const isUpdate    = await pmStore.hasGuild(userId, guildId);
      await pmStore.addGuild(userId, guildId, channelId, label);
      const displayName = label ?? `Guild \`${guildId}\``;
      const total       = await pmStore.getGuilds(userId).length;

      return interaction.reply({
        content: [
          isUpdate ? `✅ Updated **${displayName}**.` : `✅ Added **${displayName}** to your list.`,
          `📢 Partner channel: \`${channelId}\``,
          `📋 You now have **${total}** guild(s) registered.`,
          total < 2 ? `\n💡 Add at least one more guild to use \`/partner random\` or \`/partner wave\`.` : '',
        ].join('\n'),
        ephemeral: true,
      });
    }

    // ── /partner remove ───────────────────────────────────────────────────────
    if (sub === 'remove') {
      const guildId = interaction.options.getString('guild_id');
      if (!await pmStore.removeGuild(userId, guildId)) {
        return interaction.reply({ content: `❌ Guild \`${guildId}\` is not in your list.`, ephemeral: true });
      }
      return interaction.reply({ content: `🗑️ Removed guild \`${guildId}\`.`, ephemeral: true });
    }

    // ── /partner list ─────────────────────────────────────────────────────────
    if (sub === 'list') {
      const guilds = await pmStore.getGuilds(userId);
      if (guilds.length === 0) {
        return interaction.reply({ content: '📭 No guilds registered. Use `/partner setup` to add your first one.', ephemeral: true });
      }
      const lines = guilds.map((g, i) =>
        `**${i + 1}.** ${g.label ? `**${g.label}**` : `Guild \`${g.guild_id}\``} — <#${g.channel_id}> (\`${g.guild_id}\`)`
      );
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x7c5cfc)
            .setTitle(`🤝 Your Partner Guilds (${guilds.length})`)
            .setDescription(lines.join('\n'))
            .setFooter({ text: 'Use /partner wave to pair them all at once' }),
        ],
        ephemeral: true,
      });
    }

    // ── /partner random ───────────────────────────────────────────────────────
    if (sub === 'random') {
      const guilds = await pmStore.getGuilds(userId);
      if (guilds.length < 2) {
        return interaction.reply({ content: `❌ Need at least **2 guilds**. You have **${guilds.length}**.\nUse \`/partner add\` to register more.`, ephemeral: true });
      }
      const pair = await findEligiblePair(userId, guilds);
      if (!pair) {
        return interaction.reply({
          content: `⏳ **All pairs are on cooldown!** Every combination of your ${guilds.length} guilds was partnered in the last 2 days.\nTry again later or add more guilds.`,
          ephemeral: true,
        });
      }
      const [g1, g2] = pair;
      return interaction.reply({
        embeds: [buildMatchEmbed(g1, g2)],
        components: [buildConfirmRow(userId, g1.guild_id, g2.guild_id)],
        ephemeral: true,
      });
    }

    // ── /partner edit ─────────────────────────────────────────────────────────
    if (sub === 'edit') {
      const guilds = await pmStore.getGuilds(userId);

      if (guilds.length === 0) {
        return interaction.reply({ content: '📭 No guilds registered. Use `/partner setup` to add your first one.', ephemeral: true });
      }

      const select = new StringSelectMenuBuilder()
        .setCustomId(`pm_edit_select:${userId}`)
        .setPlaceholder('Choose a guild to edit...')
        .addOptions(
          guilds.slice(0, 25).map(g =>
            new StringSelectMenuOptionBuilder()
              .setLabel(guildName(g).replace(/`/g, '').slice(0, 100))
              .setDescription(`Channel: ${g.channel_id}`.slice(0, 100))
              .setValue(g.guild_id)
          )
        );

      return interaction.reply({
        content: '✏️ Which guild do you want to edit?',
        components: [new ActionRowBuilder().addComponents(select)],
        ephemeral: true,
      });
    }

    // ── /partner read ─────────────────────────────────────────────────────────
    if (sub === 'read') {
      const targetGuildId  = interaction.options.getString('guild_id');
      const overrideChId   = interaction.options.getString('channel_id');

      if (!/^\d{17,19}$/.test(targetGuildId)) {
        return interaction.reply({ content: '\u274c Invalid guild ID.', ephemeral: true });
      }

      // Check it's registered in this user's list
      const registered = await pmStore.getGuild(userId, targetGuildId);
      if (!registered) {
        return interaction.reply({
          content: `\u274c Guild \`${targetGuildId}\` is not in your partner list. Add it first with \`/partner add\`.`,
          ephemeral: true,
        });
      }

      // Resolve which channel to read from:
      //   1. Explicit override from command option
      //   2. Saved read_channel_id on this guild entry
      //   3. Fall back to partner channel
      const channelToRead = overrideChId ?? registered.read_channel_id ?? registered.channel_id;

      // If user provided an override channel, save it for next time
      if (overrideChId && overrideChId !== registered.read_channel_id) {
        await pmStore.setReadChannel(userId, targetGuildId, overrideChId);
      }

      await interaction.deferReply({ ephemeral: true });

      // Try to fetch the ad — scoped to this specific guild + channel only
      const INVITE_RE_LOCAL = /discord\.gg\/[a-zA-Z0-9-]+|discord\.com\/invite\/[a-zA-Z0-9-]+/i;

      let adText = null;
      try {
        const guild = interaction.client.guilds.cache.get(targetGuildId);
        if (guild) {
          const ch = guild.channels.cache.get(channelToRead);
          if (ch?.isTextBased()) {
            const msgs = await ch.messages.fetch({ limit: 50 });
            const adMsg = [...msgs.values()].find(m =>
              m.content?.trim().length > 0 && INVITE_RE_LOCAL.test(m.content)
            );
            if (adMsg) {
              adText = stripPings(adMsg.content);
            }
          }
        }
      } catch { /* swallow */ }

      // Fall back to waves if bot isn't in that server
      if (!adText) {
        adText = await findAdInWaves(interaction.client, userId, targetGuildId);
      }

      const displayName = registered.label ?? `Guild \`${targetGuildId}\``;
      const jumpLink2   = `https://discord.com/channels/${targetGuildId}/${channelToRead}`;

      if (!adText) {
        return interaction.editReply({
          content: [
            `\u26a0\ufe0f No ad found for **${displayName}**.`,
            `Checked channel \`${channelToRead}\`.`,
            `Make sure the bot is in that server and the channel has a message with a discord.gg link,`,
            `or add their ad to one of your \`/wave\` folders.`,
          ].join('\n'),
        });
      }

      return interaction.editReply({
        content: [
          `**\ud83d\udccb Ad from ${displayName}** ([Jump \u2192](${jumpLink2}))`,
          `*(Saved read channel: \`${channelToRead}\`)*`,
          '',
          adText,
        ].join('\n'),
      });
    }

    // ── /partner wave ─────────────────────────────────────────────────────────
    if (sub === 'wave') {
      const guilds = await pmStore.getGuilds(userId);

      if (guilds.length < 2) {
        return interaction.reply({ content: `❌ Need at least **2 guilds** to run a wave. You have **${guilds.length}**.`, ephemeral: true });
      }

      // Shuffle and pair up sequentially
      const shuffled = shuffle(guilds);
      const pairs    = [];
      for (let i = 0; i + 1 < shuffled.length; i += 2) {
        pairs.push([shuffled[i].guild_id, shuffled[i + 1].guild_id]);
      }

      const isOdd  = shuffled.length % 2 !== 0;
      const extra  = isOdd ? shuffled[shuffled.length - 1] : null;

      // Build a lookup map for the embed builder
      const guildsMap = Object.fromEntries(guilds.map(g => [g.guild_id, g]));

      // Store session
      setWaveSession(userId, { pairs, extra: extra?.guild_id ?? null, guildsMap });

      if (!isOdd) {
        // Even count — show all pairs + confirm + get ads buttons
        return interaction.reply({
          embeds: [buildWaveEmbed(pairs, guildsMap)],
          components: [
            new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setCustomId(`pm_wave_confirm:${userId}`)
                .setLabel('\u2705 Mark All as Partnered')
                .setStyle(ButtonStyle.Success),
              new ButtonBuilder()
                .setCustomId(`pm_wave_getads:${userId}`)
                .setLabel('\ud83d\udccb Get All Ads')
                .setStyle(ButtonStyle.Primary)
            ),
          ],
          ephemeral: true,
        });
      }

      // Odd count — ask which server gets the extra partnership
      // Any server except the leftover can volunteer
      const candidates = guilds.filter(g => g.guild_id !== extra.guild_id);

      const select = new StringSelectMenuBuilder()
        .setCustomId(`pm_wave_double_select:${userId}`)
        .setPlaceholder('Choose which server gets 2 partners...')
        .addOptions(
          candidates.map(g =>
            new StringSelectMenuOptionBuilder()
              .setLabel(guildName(g).slice(0, 100))
              .setDescription(`Will also partner with ${guildName(extra)}`.slice(0, 100))
              .setValue(g.guild_id)
          ).slice(0, 25) // Discord select max 25
        );

      return interaction.reply({
        embeds: [buildWaveEmbed(pairs, guildsMap, extra.guild_id)],
        components: [new ActionRowBuilder().addComponents(select)],
        ephemeral: true,
      });
    }
  },

  // ─── Button handlers ──────────────────────────────────────────────────────────

  async handleButton(interaction) {
    const parts  = interaction.customId.split(':');
    const action = parts[0];
    const userId = parts[1];

    if (interaction.user.id !== userId) {
      return interaction.reply({ content: '❌ This is not your session.', ephemeral: true });
    }

    // /partner random — confirm single pair
    if (action === 'pm_confirm') {
      const [, , guildAId, guildBId] = parts;
      await pmStore.recordPair(userId, guildAId, guildBId);
      const guilds = await pmStore.getGuilds(userId);
      const g1 = guilds.find(g => g.guild_id === guildAId);
      const g2 = guilds.find(g => g.guild_id === guildBId);
      return interaction.update({
        embeds: [
          new EmbedBuilder()
            .setColor(0x22c55e)
            .setTitle('✅ Partnership Recorded!')
            .setDescription(`**${guildName(g1 ?? { guild_id: guildAId })}** ↔ **${guildName(g2 ?? { guild_id: guildBId })}** marked as partnered.\nWon't be matched again for **2 days**.`)
            .setTimestamp(),
        ],
        components: [],
      });
    }

    // /partner random — re-roll
    if (action === 'pm_reroll') {
      const guilds = await pmStore.getGuilds(userId);
      const pair   = await findEligiblePair(userId, guilds);
      if (!pair) {
        return interaction.update({
          embeds: [
            new EmbedBuilder()
              .setColor(0xfbbf24)
              .setTitle('⏳ No eligible pairs')
              .setDescription('All your guild combinations are on the 2-day cooldown. Try again later.'),
          ],
          components: [],
        });
      }
      const [g1, g2] = pair;
      return interaction.update({
        embeds: [buildMatchEmbed(g1, g2)],
        components: [buildConfirmRow(userId, g1.guild_id, g2.guild_id)],
      });
    }

    // /partner random — get ads via DM
    if (action === 'pm_getads') {
      const [, , guildAId, guildBId] = parts;
      const guilds = await pmStore.getGuilds(userId);
      const g1     = guilds.find(g => g.guild_id === guildAId);
      const g2     = guilds.find(g => g.guild_id === guildBId);

      // Acknowledge immediately
      await interaction.reply({ content: '\ud83d\udce8 Fetching ads and sending to your DMs...', ephemeral: true });

      try {
        const dmChannel = await interaction.user.createDM();

        const adA = await fetchAdForGuild(interaction.client, userId, guildAId);
        const adB = await fetchAdForGuild(interaction.client, userId, guildBId);

        const nameA = guildName(g1 ?? { guild_id: guildAId });
        const nameB = guildName(g2 ?? { guild_id: guildBId });
        const jumpA = `https://discord.com/channels/${guildAId}/${g1?.channel_id}`;
        const jumpB = `https://discord.com/channels/${guildBId}/${g2?.channel_id}`;

        await dmChannel.send(
          `\ud83e\udd1d **Partner Session — post these ads in the correct channels**\n` +
          `After posting in both, click **\u2705 Mark as Partnered** in Discord.`
        );

        await dmChannel.send(
          `**🏠 Post this in [${nameA}'s partner channel](${jumpA}):**\n\n` +
          (adB ? adB : `⚠️ No ad found for **${nameB}** — add their ad to one of your \`/wave\` folders or make sure they've set up their ad channel.`)
        );

        await dmChannel.send(
          `**🏠 Post this in [${nameB}'s partner channel](${jumpB}):**\n\n` +
          (adA ? adA : `⚠️ No ad found for **${nameA}** — add their ad to one of your \`/wave\` folders or make sure they've set up their ad channel.`)
        );

        await dmChannel.send(`\u2705 Done! Jump links:\n${jumpA}\n${jumpB}`);
      } catch (err) {
        await interaction.followUp({ content: '\u274c Could not DM you. Make sure your DMs are open.', ephemeral: true });
      }
      return;
    }

    // /partner wave — confirm all pairs
    if (action === 'pm_wave_confirm') {
      const session = waveSessions.get(userId);
      if (!session || session.expiresAt < Date.now()) {
        return interaction.update({ content: '❌ Session expired. Run `/partner wave` again.', embeds: [], components: [] });
      }

      for (const [a, b] of session.pairs) {
        await pmStore.recordPair(userId, a, b);
      }

      waveSessions.delete(userId);

      return interaction.update({
        embeds: [
          new EmbedBuilder()
            .setColor(0x22c55e)
            .setTitle(`✅ Wave Complete! ${session.pairs.length} pair(s) recorded.`)
            .setDescription(
              session.pairs.map(([a, b], i) => {
                const gA = session.guildsMap[a];
                const gB = session.guildsMap[b];
                return `**${i + 1}.** ${guildName(gA ?? { guild_id: a })} ↔ ${guildName(gB ?? { guild_id: b })}`;
              }).join('\n')
            )
            .setFooter({ text: 'All pairs are on 2-day cooldown.' })
            .setTimestamp(),
        ],
        components: [],
      });
    }

    // /partner wave — get all ads via DM
    if (action === 'pm_wave_getads') {
      const session = waveSessions.get(userId);
      if (!session || session.expiresAt < Date.now()) {
        return interaction.reply({ content: '\u274c Session expired. Run `/partner wave` again.', ephemeral: true });
      }

      await interaction.reply({ content: `\ud83d\udce8 Fetching ads for **${session.pairs.length}** pair(s) and sending to your DMs...`, ephemeral: true });

      try {
        const dmChannel = await interaction.user.createDM();

        await dmChannel.send(
          `\ud83c\udf0a **Wave Session \u2014 ${session.pairs.length} pair(s)**\n` +
          `Copy each ad and post it in the correct partner channel.`
        );

        for (let i = 0; i < session.pairs.length; i++) {
          const [aId, bId] = session.pairs[i];
          const gA    = session.guildsMap[aId];
          const gB    = session.guildsMap[bId];
          const nameA = guildName(gA ?? { guild_id: aId });
          const nameB = guildName(gB ?? { guild_id: bId });
          const jumpA = `https://discord.com/channels/${aId}/${gA?.channel_id}`;
          const jumpB = `https://discord.com/channels/${bId}/${gB?.channel_id}`;

          const adA = await fetchAdForGuild(interaction.client, userId, aId);
          const adB = await fetchAdForGuild(interaction.client, userId, bId);

          await dmChannel.send(
            `\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\n` +
            `**Pair ${i + 1}: ${nameA} \u2194 ${nameB}**\n\n` +
            `**\ud83c\udfe0 Post in [${nameA}'s channel](${jumpA}):**\n` +
            (adB ?? `\u26a0\ufe0f No ad found for ${nameB} \u2014 add to a wave folder`) +
            `\n\n**\ud83c\udfe0 Post in [${nameB}'s channel](${jumpB}):**\n` +
            (adA ?? `\u26a0\ufe0f No ad found for ${nameA} \u2014 add to a wave folder`)
          );
        }

        await dmChannel.send(`\u2705 All ${session.pairs.length} pairs sent! Go post and then click **Mark All as Partnered**.`);
      } catch {
        await interaction.followUp({ content: '\u274c Could not DM you. Make sure your DMs are open.', ephemeral: true });
      }
      return;
    }
  },

  // ─── Select menu handler ──────────────────────────────────────────────────────

  async handleSelect(interaction) {
    const [action, userId] = interaction.customId.split(':');

    if (interaction.user.id !== userId) {
      return interaction.reply({ content: '❌ This is not your session.', ephemeral: true });
    }

    // /partner wave — user picked which server gets double
    if (action === 'pm_wave_double_select') {
      const session = waveSessions.get(userId);
      if (!session || session.expiresAt < Date.now()) {
        return interaction.update({ content: '❌ Session expired. Run `/partner wave` again.', embeds: [], components: [] });
      }

      const doubleGuildId = interaction.values[0];
      const extraGuildId  = session.extra;

      // Add the extra pair
      const updatedPairs = [...session.pairs, [doubleGuildId, extraGuildId]];
      setWaveSession(userId, { ...session, pairs: updatedPairs, extra: null });

      return interaction.update({
        embeds: [buildWaveEmbed(updatedPairs, session.guildsMap, null, doubleGuildId)],
        components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`pm_wave_confirm:${userId}`)
              .setLabel('\u2705 Mark All as Partnered')
              .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
              .setCustomId(`pm_wave_getads:${userId}`)
              .setLabel('\ud83d\udccb Get All Ads')
              .setStyle(ButtonStyle.Primary)
          ),
        ],
      });
    }
  },

  // ─── Modal handler ────────────────────────────────────────────────────────────

  async handleModal(interaction) {
    // pm_edit_modal:<userId>:<guildId>
    const parts   = interaction.customId.split(':');
    const userId  = parts[1];
    const guildId = parts[2];

    if (interaction.user.id !== userId) {
      return interaction.reply({ content: '\u274c This is not your session.', ephemeral: true });
    }

    const newChannelId = interaction.fields.getTextInputValue('pm_edit_channel').trim();
    const newLabel     = interaction.fields.getTextInputValue('pm_edit_label').trim() || null;

    if (!/^\d{17,19}$/.test(newChannelId)) {
      return interaction.reply({ content: '\u274c Invalid channel ID — must be a 17-19 digit number.', ephemeral: true });
    }

    await pmStore.addGuild(userId, guildId, newChannelId, newLabel);

    return interaction.reply({
      content: [
        `\u2705 Updated guild \`${guildId}\`.`,
        `\ud83d\udce2 Partner channel: \`${newChannelId}\``,
        newLabel ? `\ud83c\udff7\ufe0f Label: **${newLabel}**` : '\ud83c\udff7\ufe0f Label: *(cleared)*',
      ].join('\n'),
      ephemeral: true,
    });
  },
};

