import { SlashCommandBuilder, AttachmentBuilder, EmbedBuilder } from 'discord.js';
import { User, getSettings, getLevelLeaderboard, getVoiceLevelLeaderboard, getLevelFromXP } from '../../data/database.js';
import { fetchAvatar } from '../../utils/imageCache.js';

const COLOUR_COINS = '#f0b232';
const COLOUR_VOICE = '#23a55a';
const LIMIT        = 5;

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


function clampText(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + '…').width > maxWidth) t = t.slice(0, -1);
  return t + '…';
}

async function generateLeaderboardImage({ coinsData, chatData, voiceData, color, title }) {
  const FONT      = 'BotSans';

  // Layout constants
  const W         = 920;
  const OUTER_PAD = 16;
  const TITLE_H   = 52;
  const HEAD_H    = 32;
  const ROW_H     = 42;
  const COL_GAP   = 12;
  const SEC_GAP   = 12;
  const BOT_PAD   = 14;

  // Section heights
  const SEC_H = HEAD_H + LIMIT * ROW_H;   // 32 + 5*42 = 242

  // Coins section is full-width; chat + voice share the row below it side by side
  const H = TITLE_H + SEC_H + SEC_GAP + SEC_H + BOT_PAD;
  // = 52 + 242 + 12 + 242 + 14 = 562

  const canvas = createCanvas(W, H);
  const ctx    = canvas.getContext('2d');

  // ── Background ───────────────────────────────────────────────────────────
  ctx.fillStyle = '#1e1f22';
  ctx.beginPath();
  ctx.roundRect(0, 0, W, H, 16);
  ctx.fill();

  ctx.fillStyle = color || '#5865f2';
  ctx.fillRect(0, 0, W, 5);

  // ── Title ─────────────────────────────────────────────────────────────────
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold 22px ${FONT}`;
  const clampedTitle = clampText(ctx, title, W - OUTER_PAD * 2);
  ctx.fillText(clampedTitle, (W - ctx.measureText(clampedTitle).width) / 2, 34);

  // ── Row 1: COINS — full width ─────────────────────────────────────────────
  const coinsX = OUTER_PAD;
  const coinsW = W - OUTER_PAD * 2;
  await drawSection(ctx, {
    FONT, entries: coinsData, header: 'COINS', headerColor: COLOUR_COINS,
    secX: coinsX, secY: TITLE_H, secW: coinsW, HEAD_H, ROW_H, showBar: false,
  });

  // ── Row 2: CHAT XP (left) + VOICE XP (right) side by side ─────────────────
  const xpSecY = TITLE_H + SEC_H + SEC_GAP;
  const xpSecW = (W - OUTER_PAD * 2 - COL_GAP) / 2;

  await drawSection(ctx, {
    FONT, entries: chatData, header: 'CHAT XP', headerColor: color || '#5865f2',
    secX: OUTER_PAD, secY: xpSecY, secW: xpSecW, HEAD_H, ROW_H, showBar: true,
  });
  await drawSection(ctx, {
    FONT, entries: voiceData, header: 'VOICE XP', headerColor: COLOUR_VOICE,
    secX: OUTER_PAD + xpSecW + COL_GAP, secY: xpSecY, secW: xpSecW, HEAD_H, ROW_H, showBar: true,
  });

  return canvas.toBuffer('image/png', { compressionLevel: 0 });
}

async function drawSection(ctx, { FONT, entries, header, headerColor, secX, secY, secW, HEAD_H, ROW_H, showBar }) {
  // Card background
  ctx.fillStyle = '#2b2d31';
  ctx.beginPath();
  ctx.roundRect(secX, secY, secW, HEAD_H + LIMIT * ROW_H, 10);
  ctx.fill();

  // Header dot + label
  const headMidY = secY + HEAD_H / 2;
  ctx.fillStyle = headerColor;
  ctx.beginPath();
  ctx.arc(secX + 14, headMidY, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.font = `bold 13px ${FONT}`;
  ctx.fillText(header, secX + 24, headMidY + 4);

  // Divider
  ctx.fillStyle = 'rgba(255,255,255,0.07)';
  ctx.fillRect(secX + 6, secY + HEAD_H - 1, secW - 12, 1);

  const rowStartY = secY + HEAD_H;
  const maxVal    = entries[0]?.value ?? 1;

  for (let i = 0; i < Math.min(entries.length, LIMIT); i++) {
    const entry = entries[i];
    const ry    = rowStartY + i * ROW_H;
    const midY  = ry + ROW_H / 2;

    if (i % 2 === 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.025)';
      ctx.fillRect(secX + 4, ry, secW - 8, ROW_H);
    }

    // Rank
    const RANK_W      = 28;
    const medalColors = ['#FFD700', '#C0C0C0', '#CD7F32'];
    ctx.fillStyle = medalColors[i] ?? '#6b7280';
    ctx.font = `bold 12px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText(`${i + 1}`, secX + RANK_W / 2 + 2, midY + 4);
    ctx.textAlign = 'left';

    // Avatar
    const AVA = 28;
    const ax  = secX + RANK_W + 6;
    const ay  = midY - AVA / 2;

    ctx.fillStyle = '#3a3b3d';
    ctx.beginPath();
    ctx.arc(ax + AVA / 2, ay + AVA / 2, AVA / 2, 0, Math.PI * 2);
    ctx.fill();

    if (entry.avatarBuf) {
      try {
        const img = await loadImage(entry.avatarBuf);
        ctx.save();
        ctx.beginPath();
        ctx.arc(ax + AVA / 2, ay + AVA / 2, AVA / 2, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(img, ax, ay, AVA, AVA);
        ctx.restore();
      } catch { /* skip */ }
    }

    // Right-side: value (always shown) + bar (XP sections only)
    const RIGHT_PAD = 12;
    const VAL_W     = 46;
    const BAR_W     = showBar ? 90 : 0;
    const BAR_GAP   = showBar ? 8  : 0;
    const rightEdge = secX + secW - RIGHT_PAD;

    // Value text
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold 12px ${FONT}`;
    const valStr = entry.valueStr;
    const valTW  = ctx.measureText(valStr).width;
    ctx.fillText(valStr, rightEdge - valTW, midY + 4);

    // Mini bar
    if (showBar) {
      const barX = rightEdge - valTW - VAL_W - BAR_GAP - BAR_W + (VAL_W - valTW);
      // Simpler: fix bar position relative to right edge
      const bX   = rightEdge - valTW - 8 - BAR_W;
      const bY   = midY - 5;
      const bH   = 10;
      const fill = maxVal > 0 ? Math.round((entry.value / maxVal) * BAR_W) : 0;

      ctx.fillStyle = '#3a3b3d';
      ctx.beginPath();
      ctx.roundRect(bX, bY, BAR_W, bH, bH / 2);
      ctx.fill();

      if (fill > 0) {
        ctx.fillStyle = headerColor;
        ctx.beginPath();
        ctx.roundRect(bX, bY, Math.max(bH, fill), bH, bH / 2);
        ctx.fill();
      }

      // Username — between avatar and bar
      const nameX   = ax + AVA + 8;
      const maxNameW = bX - nameX - 6;
      ctx.fillStyle = '#e3e5e8';
      ctx.font = `12px ${FONT}`;
      ctx.fillText(clampText(ctx, entry.name, Math.max(maxNameW, 20)), nameX, midY + 4);
    } else {
      // Coins: username fills space between avatar and value
      const nameX    = ax + AVA + 8;
      const maxNameW = rightEdge - valTW - 16 - nameX;
      ctx.fillStyle = '#e3e5e8';
      ctx.font = `12px ${FONT}`;
      ctx.fillText(clampText(ctx, entry.name, Math.max(maxNameW, 20)), nameX, midY + 4);
    }
  }

  if (!entries.length) {
    ctx.fillStyle = '#6b7280';
    ctx.font = `12px ${FONT}`;
    ctx.fillText('No data yet', secX + 14, rowStartY + ROW_H / 2 + 4);
  }
}

export default {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('View the server leaderboard — coins, chat XP, and voice XP.'),

  async execute(interaction) {
    await interaction.deferReply();

    const guild = interaction.guild;
    if (guild.members.cache.size < guild.memberCount) await guild.members.fetch().catch(() => {});
    const memberIds = guild.members.cache.map(m => m.user.id);
    const settings  = await getSettings(guild.id);
    const colorHex  = settings.rankAccentColor ?? settings.primaryColor ?? '#5865f2';

    const [serverUsers, chatDocs, voiceDocs] = await Promise.all([
      User.find({ userId: { $in: memberIds } }).sort({ coins: -1 }).limit(LIMIT),
      getLevelLeaderboard(memberIds, guild.id, LIMIT),
      getVoiceLevelLeaderboard(memberIds, guild.id, LIMIT),
    ]);

    if (!serverUsers.length && !chatDocs.length) {
      return interaction.editReply({
        embeds: [new EmbedBuilder().setTitle('Leaderboard').setDescription('No data yet — start chatting to earn XP and coins!').setColor('Grey')]
      });
    }

    async function buildEntries(docs, getValue, getValueStr) {
      return Promise.all(docs.map(async (doc) => {
        const member    = guild.members.cache.get(doc.userId);
        const user      = member?.user ?? await guild.client.users.fetch(doc.userId).catch(() => null);
        const name      = member?.displayName ?? user?.username ?? doc.userId;
        const avatarURL = user?.displayAvatarURL({ extension: 'png', size: 32 });
        const avatarBuf = avatarURL ? await fetchAvatar(doc.userId, avatarURL) : null;
        return { name, avatarBuf, value: getValue(doc), valueStr: getValueStr(doc) };
      }));
    }

    const [coinsEntries, chatEntries, voiceEntries] = await Promise.all([
      buildEntries(serverUsers, d => d.coins, d => d.coins.toLocaleString()),
      buildEntries(chatDocs,    d => getLevelFromXP(d.xp).level,           d => `Lv ${getLevelFromXP(d.xp).level}`),
      buildEntries(voiceDocs,   d => getLevelFromXP(d.voiceXp ?? 0).level, d => `Lv ${getLevelFromXP(d.voiceXp ?? 0).level}`),
    ]);

    const title = settings.leaderboardTitle?.trim()
      ? settings.leaderboardTitle.replace(/\{server\}/gi, guild.name)
      : `${guild.name} Leaderboard`;

    if (createCanvas) {
      try {
        const buffer = await generateLeaderboardImage({
          coinsData: coinsEntries, chatData: chatEntries, voiceData: voiceEntries,
          color: colorHex, title,
        });
        const attachment = new AttachmentBuilder(buffer, { name: 'leaderboard.png' });
        return interaction.editReply({ files: [attachment] });
      } catch (e) {
        console.error('[Leaderboard] Canvas render failed:', e.message);
      }
    }

    const coinLines  = serverUsers.map((u, i) => `**${i + 1}.** <@${u.userId}> — **${u.coins.toLocaleString()}** coins`);
    const chatLines  = chatDocs.map((d, i)  => { const { level } = getLevelFromXP(d.xp);          return `**${i + 1}.** <@${d.userId}> — Level **${level}**`; });
    const voiceLines = voiceDocs.map((d, i) => { const { level } = getLevelFromXP(d.voiceXp ?? 0); return `**${i + 1}.** <@${d.userId}> — Level **${level}**`; });

    return interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setTitle(title)
          .addFields(
            { name: 'Coins',    value: coinLines.join('\n')  || 'No data', inline: true },
            { name: 'Chat XP',  value: chatLines.join('\n')  || 'No data', inline: true },
            { name: 'Voice XP', value: voiceLines.join('\n') || 'No data', inline: true },
          )
          .setColor(colorHex)
      ]
    });
  }
};
