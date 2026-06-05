import { SlashCommandBuilder, AttachmentBuilder } from 'discord.js';
import { getLevelData, getVoiceLevelData, getUserRank, getUserVoiceRank, getSettings, getUserBalance } from '../../data/database.js';
import axios from 'axios';

// Shared accent colours — keep these consistent with the leaderboard
export const COLOUR_COINS = '#f0b232';   // gold
export const COLOUR_VOICE = '#23a55a';   // green

let createCanvas, loadImage, GlobalFonts;
try {
  const canvasMod = await import('@napi-rs/canvas');
  createCanvas = canvasMod.createCanvas;
  loadImage    = canvasMod.loadImage;
  GlobalFonts  = canvasMod.GlobalFonts;
  const FONT_DIR = '/usr/share/fonts/dejavu';
  try {
    GlobalFonts.registerFromPath(`${FONT_DIR}/DejaVuSans.ttf`,      'BotSans');
    GlobalFonts.registerFromPath(`${FONT_DIR}/DejaVuSans-Bold.ttf`, 'BotSans');
  } catch {
    try { GlobalFonts.loadFontsFromDir('/usr/share/fonts'); } catch { /* dev env */ }
  }
} catch {
  createCanvas = null;
}

function buildProgressBar(current, required, length = 12) {
  const filled = required > 0 ? Math.round((current / required) * length) : 0;
  return '█'.repeat(filled) + '░'.repeat(length - filled);
}

function drawDot(ctx, x, y, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

async function generateRankCard({ username, coins, avatarURL, chatLevel, chatXp, chatRequired, voiceLevel, voiceXp, voiceRequired, chatRank, voiceRank, color, showVoice }) {
  const FONT     = 'BotSans';
  const W        = 920;
  const PAD      = 24;
  const AVA      = 108;
  const textX    = PAD + AVA + 22;
  const barW     = W - textX - PAD;
  const barH     = 18;
  const SECTION_H = 58;

  // Header: username line + coin balance line
  const HEADER_H = 88;

  const sections = showVoice ? 2 : 1;
  const H = PAD + HEADER_H + sections * SECTION_H + PAD;

  const canvas = createCanvas(W, H);
  const ctx    = canvas.getContext('2d');

  // ── Background ──────────────────────────────────────────────────────────
  ctx.fillStyle = '#1e1f22';
  ctx.beginPath();
  ctx.roundRect(0, 0, W, H, 16);
  ctx.fill();

  ctx.fillStyle = color || '#5865f2';
  ctx.fillRect(0, 0, 6, H);

  // ── Avatar ──────────────────────────────────────────────────────────────
  const avatarX = PAD + 2;
  const avatarY = (H - AVA) / 2;
  const cx = avatarX + AVA / 2, cy = avatarY + AVA / 2;

  try {
    const res = await axios.get(avatarURL, { responseType: 'arraybuffer' });
    const img = await loadImage(Buffer.from(res.data));
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, AVA / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(img, avatarX, avatarY, AVA, AVA);
    ctx.restore();
    ctx.strokeStyle = color || '#5865f2';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, cy, AVA / 2 + 3, 0, Math.PI * 2);
    ctx.stroke();
  } catch { /* skip if avatar unavailable */ }

  // ── Username ─────────────────────────────────────────────────────────────
  const usernameY = PAD + 46;
  ctx.font = `bold 28px ${FONT}`;
  ctx.fillStyle = '#ffffff';
  const maxUsernameW = W - textX - 170;
  let displayName = username;
  while (displayName.length > 1 && ctx.measureText(displayName).width > maxUsernameW) {
    displayName = displayName.slice(0, -1);
  }
  if (displayName !== username) displayName += '…';
  ctx.fillText(displayName, textX, usernameY);

  // ── Coin balance (below username) ─────────────────────────────────────────
  const coinY = usernameY + 24;
  const dotR  = 5;
  drawDot(ctx, textX + dotR, coinY - dotR + 1, dotR, COLOUR_COINS);
  ctx.fillStyle = COLOUR_COINS;
  ctx.font = `bold 13px ${FONT}`;
  ctx.fillText(`${coins.toLocaleString()} coins`, textX + dotR * 2 + 7, coinY);

  // ── Rank badges (chat + voice, top-right) ────────────────────────────────
  ctx.font = `bold 13px ${FONT}`;
  const bPad = 12;
  const bH   = 24;
  const bY   = PAD + 10;
  const GAP  = 6;

  function drawBadge(text, bgColor, rightEdge) {
    const tw = ctx.measureText(text).width;
    const bW = tw + bPad * 2;
    const bX = rightEdge - bW;
    ctx.fillStyle = bgColor;
    ctx.beginPath();
    ctx.roundRect(bX, bY, bW, bH, 5);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, bX + bPad, bY + bH - 7);
    return bX;  // return left edge so the next badge can stack to its left
  }

  // Draw voice badge first (rightmost), then chat badge to its left
  const voiceLeft = drawBadge(`VOICE  #${voiceRank}`, COLOUR_VOICE,        W - PAD);
  drawBadge(`CHAT  #${chatRank}`,  color || '#5865f2', voiceLeft - GAP);

  // ── XP sections ───────────────────────────────────────────────────────────
  const sec1Y = PAD + HEADER_H;
  drawXpSection(ctx, { FONT, textX, barW, barH, sectionY: sec1Y,
    label: 'CHAT', level: chatLevel, xp: chatXp, required: chatRequired,
    barColor: color || '#5865f2' });

  if (showVoice) {
    const sec2Y = sec1Y + SECTION_H;
    drawXpSection(ctx, { FONT, textX, barW, barH, sectionY: sec2Y,
      label: 'VOICE', level: voiceLevel, xp: voiceXp, required: voiceRequired,
      barColor: COLOUR_VOICE });
  }

  return canvas.toBuffer('image/png');
}

function drawXpSection(ctx, { FONT, textX, barW, barH, sectionY, label, level, xp, required, barColor }) {
  const pct    = required > 0 ? Math.min(xp / required, 1) : 0;
  const pctStr = `${Math.round(pct * 100)}%`;
  const dotR   = 5;
  const labelY = sectionY + 14;
  const barY   = sectionY + 26;

  // Coloured dot icon
  drawDot(ctx, textX + dotR, labelY - 4, dotR, barColor);

  // "CHAT · LEVEL 3" on the left
  ctx.fillStyle = barColor;
  ctx.font = `bold 13px ${FONT}`;
  ctx.fillText(`${label}  ·  LEVEL ${level}`, textX + dotR * 2 + 7, labelY);

  // "45 / 100 XP · 45%" right-aligned — % is inline with the XP count
  const xpText  = `${xp.toLocaleString()} / ${required.toLocaleString()} XP  ·  ${pctStr}`;
  ctx.fillStyle = '#909399';
  ctx.font      = `12px ${FONT}`;
  const xpTW    = ctx.measureText(xpText).width;
  ctx.fillText(xpText, textX + barW - xpTW, labelY);

  // Bar background
  ctx.fillStyle = '#2e3035';
  ctx.beginPath();
  ctx.roundRect(textX, barY, barW, barH, barH / 2);
  ctx.fill();

  // Bar fill — 0% shows empty track, any positive value shows at least a full pill
  if (pct > 0) {
    const fillW = Math.max(barH, barW * pct);
    ctx.fillStyle = barColor;
    ctx.beginPath();
    ctx.roundRect(textX, barY, fillW, barH, barH / 2);
    ctx.fill();
  }
}

export default {
  data: new SlashCommandBuilder()
    .setName('rank')
    .setDescription("Check your or another user's level and XP.")
    .addUserOption(opt =>
      opt.setName('user').setDescription('The user to check (defaults to yourself)').setRequired(false)
    ),

  async execute(interaction) {
    await interaction.deferReply();

    const target  = interaction.options.getUser('user') ?? interaction.user;
    const guildId = interaction.guild.id;
    await interaction.guild.members.fetch().catch(() => {});
    const memberIds = interaction.guild.members.cache.map(m => m.user.id);

    const [chat, voice, chatRank, voiceRank, settings, coins] = await Promise.all([
      getLevelData(target.id, guildId),
      getVoiceLevelData(target.id, guildId),
      getUserRank(target.id, guildId, memberIds),
      getUserVoiceRank(target.id, guildId, memberIds),
      getSettings(guildId),
      getUserBalance(target.id),
    ]);

    const showVoice = settings.rankShowVoice !== false;

    if (createCanvas) {
      try {
        const colorHex = settings.rankAccentColor ?? settings.primaryColor ?? '#5865f2';
        const buffer = await generateRankCard({
          username:      target.username,
          coins,
          avatarURL:     target.displayAvatarURL({ extension: 'png', size: 128 }),
          chatLevel:     chat.level,
          chatXp:        chat.currentXp,
          chatRequired:  chat.requiredXp,
          voiceLevel:    voice.level,
          voiceXp:       voice.currentXp,
          voiceRequired: voice.requiredXp,
          chatRank,
          voiceRank,
          color:         colorHex,
          showVoice,
        });

        const attachment = new AttachmentBuilder(buffer, { name: 'rank.png' });
        const title = settings.rankCardTitle?.trim()
          ? settings.rankCardTitle.replace(/\{user\}/gi, target.username)
          : null;

        if (settings.rankCardFooter?.trim()) {
          const { EmbedBuilder } = await import('discord.js');
          const embed = new EmbedBuilder().setImage('attachment://rank.png').setColor(colorHex);
          if (title) embed.setTitle(title);
          embed.setFooter({ text: settings.rankCardFooter });
          return interaction.editReply({ embeds: [embed], files: [attachment] });
        }
        return interaction.editReply({ files: [attachment] });
      } catch (e) {
        console.error('[Rank] Canvas render failed, falling back to embed:', e.message);
      }
    }

    // Fallback text embed
    const { EmbedBuilder } = await import('discord.js');
    const chatBar  = buildProgressBar(chat.currentXp,  chat.requiredXp);
    const voiceBar = buildProgressBar(voice.currentXp, voice.requiredXp);
    const chatPct  = chat.requiredXp  > 0 ? Math.floor((chat.currentXp  / chat.requiredXp)  * 100) : 0;
    const voicePct = voice.requiredXp > 0 ? Math.floor((voice.currentXp / voice.requiredXp) * 100) : 0;

    const defaultTitle = `${target.username}'s Rank`;
    const title = settings.rankCardTitle?.trim()
      ? settings.rankCardTitle.replace(/\{user\}/gi, target.username)
      : defaultTitle;

    const fields = [
      { name: 'Chat Level',  value: `${chat.level}`,  inline: true },
      ...(showVoice ? [{ name: 'Voice Level', value: `${voice.level}`, inline: true }] : []),
      { name: 'Chat Rank',  value: `#${chatRank}`,  inline: true },
      ...(showVoice ? [{ name: 'Voice Rank', value: `#${voiceRank}`, inline: true }] : []),
      { name: 'Coins',      value: `${coins.toLocaleString()}`, inline: true },
      { name: 'Chat XP',  value: `\`${chatBar}\` ${chat.currentXp} / ${chat.requiredXp} XP (${chatPct}%)` },
      ...(showVoice ? [{ name: 'Voice XP', value: `\`${voiceBar}\` ${voice.currentXp} / ${voice.requiredXp} XP (${voicePct}%)` }] : []),
    ];

    const embed = new EmbedBuilder()
      .setTitle(title)
      .setThumbnail(target.displayAvatarURL())
      .addFields(fields)
      .setColor(settings.primaryColor ?? 'Blurple');

    if (settings.rankCardFooter?.trim()) embed.setFooter({ text: settings.rankCardFooter });
    await interaction.editReply({ embeds: [embed] });
  }
};
