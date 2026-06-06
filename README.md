# Wind bot

A feature-rich Discord bot built with **discord.js v14** for server management, partner wave advertising, giveaways, tickets, and more.

## ✨ Features

### 🌊 Wave System (User-Installable)
- `/wave create` — Build a partner ad wave interactively
- `/wave add` — Add more servers to an existing wave
- `/wave insert` — Insert an ad between existing servers
- `/wave edit` — Replace a specific server's ad
- `/wave paste` — Send all ads publicly with 8s delay (auto-skips current server + dead links)
- `/wave copy` — Show ads privately (ephemeral) so you can copy-paste manually
- `/wave dm` — Send all ads to your DMs
- `/wave list` / `/wave delete` / `/wave rename`

### 🎉 Giveaway System
- `/bcreate` — Create a timed giveaway with reaction entry
- `/bend` — End a giveaway early
- `/brig` — Force a specific user to win (must have entered)

### 🎫 Ticket System
- `/ticket setup` — Post a ticket panel with an Open button
- `/ticket close` — Close a ticket channel

### 🛡️ Moderation
- `/purge` — Bulk delete messages (optionally from a specific user)
- `/kick` / `/ban` / `/unban` — Standard moderation with DM notifications
- `/timeout` — Discord native timeout with duration parsing
- `/lock channel` / `/lock unlock` — Lock/unlock channels
- `/slowmode` — Set channel rate limits
- `/role add` / `/role remove` / `/role info` — Role management

### 📊 Utility
- `/ping` — Bot latency (user-installable)
- `/userinfo` — Account info, join dates, roles
- `/serverinfo` — Server stats, boost level, owner
- `/avatar` — Full-size avatar with PNG/GIF links
- `/announce` — Rich embed announcements with role ping
- `/poll` — 2–4 option reaction poll

### ⚙️ Server Setup
- `/setup welcome` — Welcome messages with `{user}` `{server}` `{count}` variables
- `/setup autorole` — Auto-assign role to new members
- `/setup test` — Test your welcome message


## ⚠️ Required Bot Permissions
- Manage Channels, Manage Roles, Manage Messages
- Kick Members, Ban Members, Moderate Members
- Send Messages, Embed Links, Add Reactions, Read Message History
- View Channels


## 📄 License
MIT
