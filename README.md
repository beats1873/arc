# Arcturus

> **Developed and maintained by [.beats](https://github.com/beats1873) — [GitHub Repository](https://github.com/beats1873/arcturus)**

A feature-rich Discord bot built with **discord.js v14** and **MongoDB**, with a full-featured web dashboard. Includes a coin economy, XP leveling, birthdays, trivia, hangman, giveaways, server boost announcements, animated emotes, a server shop, a webhook message builder, and more — all configurable from a browser.

---

## Features

| Feature | Summary |
|---|---|
| 💰 Coin Economy | Daily/weekly rewards, visual leaderboard image, admin coin management |
| ⚡ XP & Leveling | Chat and voice XP tracked separately, visual rank card with coin balance and dual rank badges |
| 🏆 Leaderboard | Image leaderboard: coins (full width), chat XP + voice XP side by side — top 5 each |
| 🎂 Birthdays | Midnight announcements, birthday role, birthday coin claim |
| 💜 Booster Announcements | Embed posted when a member boosts or un-boosts |
| ❓ Trivia | 400+ questions, strict answer checking, scheduled sessions, coin rewards |
| 🎮 Hangman | Prefix-based game with coin rewards; word category revealed at start |
| 🎉 Giveaways | Timed giveaways with reaction entry, reroll, fully customisable entry and winner embeds |
| 🛒 Shop | Members spend coins on admin-defined items; shop items can be fully edited from the dashboard |
| 👋 Welcome | Customisable embed with variables for mention, username, server name, and member count |
| 🏷️ Auto Role | Automatically grants a configured role to every new member on join |
| 😄 Emotes | 32 animated GIF reaction commands via the Kawaii API |
| 🔗 Webhook Builder | Rich embed builder with live Discord preview, bot-managed webhooks |
| 🖥️ Web Dashboard | Full settings UI with structured logs viewer, login via Discord OAuth2 |

---

## Dashboard

The dashboard runs alongside the bot on port **3001** and covers every configurable setting. Login is handled by Discord OAuth2 — only members with **Administrator** or **Manage Server** permission can access it. Sessions persist for 24 hours.

### Navigation

| Category | Sections |
|---|---|
| **Overview** | Stats, Transactions |
| **Features** | Auto Role, Birthday, Booster, Giveaways, Hangman, Shop, Trivia, Welcome, Webhooks, XP & Leveling |
| **Settings** | Settings, Colors |
| **Help** | Logs, Documentation |

### Section reference

| Section | What you can configure |
|---|---|
| **Stats** | Live server stats — members, coins, XP, 8 leaderboard charts (all-time + this week) |
| **Transactions** | 30-day coin activity log with type filtering and CSV export |
| **Auto Role** | Enabled toggle, role to automatically grant every new member on join |
| **Birthday** | Announcement channel, timezone, birthday role, embed title/description/footer (supports `{member}`, `{mention}`, `{age}`) |
| **Booster** | Announcement channel, embed title/description/footer (supports `{member}`, `{mention}`) |
| **Giveaways** | Enabled toggle, giveaway roles, entry emoji, entry embed customisation, **winner announce embed** customisation |
| **Hangman** | Enabled toggle, optional channel restriction |
| **Shop** | Add, **edit**, and remove purchasable items; set fulfilment notification role/channel |
| **Trivia** | Channel, interval, questions per session, mod roles, live session control |
| **Welcome** | Enabled toggle, channel, embed text (supports `{user}`, `{mention}`, `{server}`, `{count}`) |
| **Webhooks** | Build and send rich embeds with live Discord preview, bot-managed webhooks per channel |
| **XP & Leveling** | XP toggles, chat/voice XP rates, rank card customisation, leaderboard title, level role mapping, XP boost roles, **unified chat+voice ignore channels** |
| **Settings** | Command prefix, emote prefix, moderator roles |
| **Colors** | Global embed accent colours (primary/success/error/warning) and rank/leaderboard image accent colour |
| **Logs** | Live in-dashboard log viewer — last 500 lines, filterable by level/tag/keyword, auto-refreshes every 5 seconds |
| **Documentation** | Full in-app command and settings reference |

---

## Commands

### 💰 Economy

| Command | Description |
|---|---|
| `/coins` | Check your current coin balance |
| `/daily` | Claim daily coins (100 coins, once per 24 hours) |
| `/weekly` | Claim weekly coins (500 coins, once per 7 days) |

### 🏆 Leaderboard

| Command | Description |
|---|---|
| `/leaderboard` | Visual image leaderboard — **Coins** (full width, top 5 in gold), **Chat XP** and **Voice XP** side by side (top 5 each). Consistent colour coding: gold for coins, primary colour for chat, green for voice. |

### ⚡ XP & Leveling

| Command | Description |
|---|---|
| `/rank [user]` | Visual rank card showing: avatar, username, coin balance, **Chat rank badge** (primary colour), **Voice rank badge** (green), chat XP bar with % inline, voice XP bar with % inline |

### 🎂 Birthday

| Command | Description |
|---|---|
| `/birthday set <month> <day>` | Register your birthday |
| `/birthday remove` | Delete your stored birthday |
| `/birthday claim` | Claim a birthday coin bonus (once per year) |

### ❓ Trivia

Answer checking is strict — answers must match exactly or have at most one typo (two for long words). Similar-sounding words (e.g. "Nigeria" for "Algeria") are rejected.

| Command | Description |
|---|---|
| `/trivia start` | Start a trivia session in the configured channel |
| `/trivia stop` | Stop the active trivia session |

### 🎮 Hangman

The bot announces the **word category** (e.g. Animals, Places, Food) when a game starts.

| Command | Description |
|---|---|
| `{prefix}hangman` (default: `+hangman`) | Start a hangman game — type a letter or the whole word to guess. Prefix is configurable in the dashboard under **Settings**. |

### 🎉 Giveaways

Duration supports `d` (days), `h` (hours), `m` (minutes), and `s` (seconds). No host attribution is shown in the giveaway embed. The winner announcement embed is fully customisable from the dashboard.

| Command | Description |
|---|---|
| `/giveaway start <prize> <duration>` | Start a new giveaway (e.g. `1h`, `30m`, `10s`) |
| `/giveaway end <id>` | End a giveaway early and pick a winner |
| `/giveaway list` | View all active giveaways |
| `/giveaway reroll <id>` | Reroll the winner of an ended giveaway |

### 🛒 Shop

| Command | Description |
|---|---|
| `/shop list` | Browse available shop items |
| `/shop buy <item>` | Purchase an item by name |

### 😄 Emotes

Use `{emotePrefix}<emote>` (default: `=<emote>`), optionally followed by `@user` to target someone. The emote prefix is configurable in the dashboard under **Settings**.

Available emotes: `blush` `bite` `boop` `clap` `confused` `cry` `cuddle` `dance` `die` `disappear` `facepalm` `fight` `happy` `highfive` `hug` `kill` `kiss` `laugh` `mad` `pat` `poke` `punch` `run` `scared` `shoot` `shrug` `sip` `slap` `smile` `tickle` `wave` `wink`

---

## Embed Variables

Several embeds support dynamic variables that are replaced at send time:

| Embed | Variables |
|---|---|
| Birthday | `{member}` username · `{mention}` Discord mention · `{age}` age (blank if year not set) |
| Booster | `{member}` username · `{mention}` Discord mention |
| Welcome | `{user}` username · `{mention}` Discord mention · `{server}` server name · `{count}` member count |
| Giveaway entry | `{prize}` prize name · `{emoji}` entry emoji |
| Giveaway winner | `{prize}` prize name · `{winner}` winner mention · `{entries}` entry count |
| Rank card title | `{user}` username |
| Leaderboard title | `{server}` server name |

---

## Transaction Types

| Type | Source |
|---|---|
| `Daily` | `/daily` command |
| `Weekly` | `/weekly` command |
| `Birthday` | `/birthday claim` |
| `Trivia` | Correctly answering a trivia question |
| `Hangman` | Winning a hangman game |
| `Level Up` | Reaching a new chat XP level |
| `Add` | Admin `/addcoins` |
| `Remove` | Admin `/removecoins` |
| `Reset` | Admin `/resetcoins` |
| `Purchase` | `/shop buy` |

---

## Setup

### Prerequisites

- **Docker** and **Docker Compose** — [Install Docker](https://docs.docker.com/get-docker/)
- A Discord application from the [Discord Developer Portal](https://discord.com/developers/applications)
- A [Kawaii API](https://kawaii.red) key for animated emote GIFs
- Your Discord server ID (right-click the server icon → Copy Server ID)

### Discord Bot Configuration

In the Developer Portal → **Bot** tab:

**Privileged Gateway Intents** — enable all three:
- **Server Members Intent** — required for member lookups, leaderboards, role assignment
- **Message Content Intent** — required for prefix commands, trivia answers, hangman guesses
- **Presence Intent** — optional, not currently used but harmless to enable

**Invite URL** — go to **OAuth2 → URL Generator**, select:

Scopes: `bot`, `applications.commands`

Bot Permissions:
| Permission | Reason |
|---|---|
| View Channels | Read channels to post in |
| Send Messages | All bot responses |
| Embed Links | All responses use embeds |
| Read Message History | Hangman and trivia interactions |
| Use External Emojis | Emote/birthday/boost rendering |
| Manage Roles | Assign level roles, birthday roles, and auto role |
| Manage Webhooks | Create/manage channel webhooks for the webhook builder |
| Add Reactions | React to giveaway messages with the entry emoji |

> **Role order:** Manage Roles only works for roles that sit *below* the bot's own highest role. After inviting, go to **Server Settings → Roles** and drag the Arcturus role above any managed roles (including auto role).

### Dashboard OAuth2 Setup

1. In the [Discord Developer Portal](https://discord.com/developers/applications) → **OAuth2 → General**
2. Under **Redirects**, add your callback URL:
   - Local: `http://localhost:3001/auth/callback`
   - Remote: `https://yourdomain.com/auth/callback`
3. Copy the **Client Secret** for `CLIENT_SECRET` in your `.env`

The redirect URI must exactly match `DASHBOARD_URL` + `/auth/callback` in your `.env`.

---

## Installation

Arcturus runs exclusively via **Docker Compose**. This bundles the bot, dashboard, and MongoDB into a single managed stack and handles automatic restarts on crash or server reboot.

### First-time setup

```bash
git clone https://github.com/beats1873/arcturus.git
cd arcturus
cp .env.example .env
```

Edit `.env` with your values (see [Environment Variables](#environment-variables)), then:

```bash
# Register slash commands with Discord (only needed on first run or when commands change)
docker compose run --rm bot node deploy-commands.js

# Start the stack in the background
docker compose up -d
```

Dashboard: `http://your-server-ip:3001`

### Auto-restart after reboot

Both containers are configured with `restart: always` in `docker-compose.yml`. This means:

- If the bot crashes, Docker restarts it immediately.
- If the VPS reboots due to an outage or maintenance, Docker starts the containers automatically as soon as the Docker daemon comes back up.

Verify the Docker daemon itself starts on boot:

```bash
sudo systemctl is-enabled docker   # should output "enabled"
# If not enabled:
sudo systemctl enable docker
```

### Deploying updates

```bash
git pull origin main
# If slash commands changed (new command or removed subcommand):
docker compose run --rm bot node deploy-commands.js
# Rebuild and restart:
docker compose up -d --build bot
```

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DISCORD_TOKEN` | ✅ | Bot token from the Discord Developer Portal |
| `CLIENT_ID` | ✅ | Application (client) ID from the Developer Portal |
| `CLIENT_SECRET` | ✅ | OAuth2 client secret — used for dashboard login |
| `GUILD_ID` | ✅ | ID of the Discord server to register slash commands to |
| `KAWAII_API_KEY` | ✅ | API key for animated emote GIFs from [kawaii.red](https://kawaii.red) |
| `MONGO_URI` | Docker only | Set automatically by Docker Compose. Only set manually if running without Docker. |
| `DASHBOARD_URL` | No | Base URL of the dashboard (default: `http://localhost:3001`) |
| `DASHBOARD_PORT` | No | Port the dashboard listens on (default: `3001`) |
| `LOG_LEVEL` | No | Logging verbosity: `DEBUG`, `INFO`, `WARN`, or `ERROR` (default: `INFO`). Use `DEBUG` when troubleshooting. |

---

## Reference

### Docker management

```bash
docker compose up -d                         # start all containers in background
docker compose down                          # stop all containers (keeps MongoDB data)
docker compose down -v                       # stop and wipe MongoDB volume (destructive!)
docker compose up -d --build bot             # rebuild bot image and restart (use after git pull)
docker compose logs -f bot                   # stream live bot logs
docker compose logs -f                       # stream all container logs
docker compose ps                            # list container status
docker compose restart bot                   # restart bot container only
docker compose run --rm bot node deploy-commands.js   # re-register slash commands
```

### Log levels

Set `LOG_LEVEL` in your `.env` to control verbosity:

| Level | What you see |
|---|---|
| `DEBUG` | Everything — XP gains per message, every trivia answer attempt, all HTTP requests to the dashboard |
| `INFO` | Normal operation — logins, level-ups, giveaway starts/ends, cron runs (default) |
| `WARN` | Non-fatal issues — missing roles, failed optional actions |
| `ERROR` | Failures that need attention — command crashes, DB errors, failed logins |

To tail logs at debug level without changing your `.env` permanently:

```bash
docker compose run --rm -e LOG_LEVEL=DEBUG bot node index.js
```

Logs are also viewable live from the dashboard under **Help → Logs** — the last 500 lines are held in memory with level/tag/keyword filters and 5-second auto-refresh.

---

## License

[MIT](https://opensource.org/licenses/MIT)

---

*Developed and published by [.beats](https://github.com/beats1873)*
