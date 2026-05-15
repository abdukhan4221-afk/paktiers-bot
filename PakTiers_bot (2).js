// ============================================================
//  PakTiers Discord Bot — Complete Edition
//  Pakistan Minecraft Java PvP Rankings & Matchmaking
// ============================================================
//
//  SETUP:
//  1. npm install discord.js node-fetch
//  2. Fill in config below OR use environment variables
//  3. node PakTiers_bot.js
//
// ============================================================

const CONFIG = {
  BOT_TOKEN:         process.env.BOT_TOKEN,
  CLIENT_ID:         '1504744014526677003',
  GUILD_ID:          '1478080380014952610',
  TIERER_ROLE_ID:    '1504503176358006834',
  MATCH_CHANNEL_ID:  '1504510227322503189',

  // ── SYNC CHANNEL ─────────────────────────────────────────
  // Ye channel ID mod (DiscordPoller) read karta hai.
  // MATCH_CHANNEL_ID se alag private channel rakhna better hai.
  // Mod config mein bhi yahi ID daalni hai: discordChannelId
  TIER_SYNC_CHANNEL_ID: process.env.TIER_SYNC_CHANNEL_ID || '1504510227322503189',
};

const {
  Client, GatewayIntentBits, Collection, REST, Routes,
  SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits,
} = require('discord.js');
const fs   = require('fs');
const path = require('path');

// ═══════════════════════════════════════════════════════════
//  CONSTANTS
// ═══════════════════════════════════════════════════════════

const WEAPONS = ['Mace', 'Crystal', 'Sword', 'Axe', 'Netherite'];

// ─── CUSTOM SERVER EMOJIS ────────────────────────────────────
// Discord server emoji format: <:name:ID>
// IDs bharne ke liye:
//   Discord mein emoji type karo (\:vanilla:) → emoji par hover → ID copy karo
//   Ya Server Settings → Emoji → emoji par right click → Copy Emoji ID
//
// Format: <:emojiname:123456789012345678>
//
const EMOJI_IDS = {
  Crystal:   process.env.EMOJI_CRYSTAL   || '',   // :vanilla: emoji ID
  Mace:      process.env.EMOJI_MACE      || '',   // :mace: emoji ID
  Netherite: process.env.EMOJI_NETHERITE || '',   // :netherite: emoji ID
  Sword:     process.env.EMOJI_SWORD     || '',   // :sword: emoji ID
  Axe:       process.env.EMOJI_AXE       || '',   // :axe: emoji ID
};

// Custom emoji string banao — agar ID set nahi to fallback emoji use hoga
function makeEmoji(weapon) {
  const names = {
    Crystal: 'vanilla', Mace: 'mace',
    Netherite: 'netherite', Sword: 'sword', Axe: 'axe',
  };
  const fallback = {
    Crystal: '💠', Mace: '🔨', Netherite: '🪨', Sword: '⚔️', Axe: '🪓',
  };
  const id = EMOJI_IDS[weapon];
  return id ? `<:${names[weapon]}:${id}>` : fallback[weapon];
}

const WEAPON_EMOJI = {
  Mace:      makeEmoji('Mace'),
  Crystal:   makeEmoji('Crystal'),
  Sword:     makeEmoji('Sword'),
  Axe:       makeEmoji('Axe'),
  Netherite: makeEmoji('Netherite'),
};

// mctiers.com API gamemode names — mod ke TierCache ke saath match karna zaroori hai
const WEAPON_TO_MCTIERS = {
  Mace:      'mace',
  Crystal:   'vanilla',   // mctiers.com par Crystal = "vanilla"
  Sword:     'sword',
  Axe:       'axe',
  Netherite: 'netherite',
};

const TIERS = ['HT1','LT1','HT2','LT2','HT3','LT3','HT4','LT4','HT5','LT5'];

const TIER_PTS = {
  HT1:10, LT1:9, HT2:8, LT2:7, HT3:6, LT3:5, HT4:4, LT4:3, HT5:2, LT5:1,
};

const TIER_COLOR = {
  HT1:0xFF6B00, LT1:0xFF9933, HT2:0xFFB800, LT2:0xFFD700,
  HT3:0x00C864, LT3:0x00A550, HT4:0x4FC3F7, LT4:0x29B6F6,
  HT5:0x888888, LT5:0x555555,
};

const TIER_BAR = {
  HT1:'▰▰▰▰▰▰▰▰▰▰', LT1:'▰▰▰▰▰▰▰▰▰▱',
  HT2:'▰▰▰▰▰▰▰▰▱▱', LT2:'▰▰▰▰▰▰▰▱▱▱',
  HT3:'▰▰▰▰▰▰▱▱▱▱', LT3:'▰▰▰▰▰▱▱▱▱▱',
  HT4:'▰▰▰▰▱▱▱▱▱▱', LT4:'▰▰▰▱▱▱▱▱▱▱',
  HT5:'▰▰▱▱▱▱▱▱▱▱', LT5:'▰▱▱▱▱▱▱▱▱▱',
};

const BRAND_COLOR = 0x7FFF00;
const BOT_FOOTER  = 'PakTiers · Pakistan Minecraft Community';

function getRankTitle(pts) {
  if (pts >= 101) return { label:'COMBAT ACE',        emoji:'🔥' };
  if (pts >= 51)  return { label:'COMBAT SPECIALIST', emoji:'⚡' };
  if (pts >= 26)  return { label:'COMBAT CADET',      emoji:'🟢' };
  if (pts >= 10)  return { label:'COMBAT NOICE',      emoji:'🔵' };
  return                  { label:'ROOKIE',            emoji:'⚪' };
}

function getTierLabel(tier) {
  const map = {
    HT1:'High T1', LT1:'Low T1', HT2:'High T2', LT2:'Low T2',
    HT3:'High T3', LT3:'Low T3', HT4:'High T4', LT4:'Low T4',
    HT5:'High T5', LT5:'Low T5',
  };
  return map[tier] || tier;
}

// ═══════════════════════════════════════════════════════════
//  MOJANG UUID FETCH
//  Discord bot ke paas sirf IGN hota hai — Minecraft UUID
//  Mojang API se fetch karna padta hai taake mod precisely
//  TierCache ko UUID se refresh kar sake.
// ═══════════════════════════════════════════════════════════

const uuidCache = new Map(); // IGN (lowercase) → { uuid, fetchedAt }
const UUID_CACHE_TTL = 30 * 60 * 1000; // 30 minutes

async function fetchMinecraftUUID(ign) {
  const key = ign.toLowerCase();
  const cached = uuidCache.get(key);
  if (cached && (Date.now() - cached.fetchedAt) < UUID_CACHE_TTL) {
    return cached.uuid;
  }
  try {
    const res  = await fetch(`https://api.mojang.com/users/profiles/minecraft/${ign}`);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.id) return null;
    // Mojang UUID has no dashes — add them: 8-4-4-4-12
    const raw  = data.id;
    const uuid = `${raw.slice(0,8)}-${raw.slice(8,12)}-${raw.slice(12,16)}-${raw.slice(16,20)}-${raw.slice(20)}`;
    uuidCache.set(key, { uuid, fetchedAt: Date.now() });
    return uuid;
  } catch (_) {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════
//  TIER SYNC EMBED (Bot → Mod)
//  Ye embed DiscordPoller.parseSyncEmbed() read karta hai.
//  Fields: player, uuid, weapon (mctiers gamemode), tier
// ═══════════════════════════════════════════════════════════

async function postTierSyncEmbed(client, player, weapon, tier, tieredByUserId) {
  if (!CONFIG.TIER_SYNC_CHANNEL_ID) return;
  try {
    const ch = await client.channels.fetch(CONFIG.TIER_SYNC_CHANNEL_ID);
    if (!ch) return;

    // UUID fetch karo taake mod cache precisely refresh kare
    const uuid = await fetchMinecraftUUID(player.ign);
    const mctiersGamemode = WEAPON_TO_MCTIERS[weapon] || weapon.toLowerCase();

    await ch.send({
      embeds: [new EmbedBuilder()
        .setColor(TIER_COLOR[tier] || BRAND_COLOR)
        .setTitle('🔄 PakTiers Tier Sync')
        .setDescription(`Tier update — mod cache refresh hoga automatically.`)
        .addFields(
          { name: 'player',   value: player.ign,           inline: true },
          { name: 'uuid',     value: uuid || 'not-found',  inline: true },
          { name: 'weapon',   value: mctiersGamemode,       inline: true },
          { name: 'tier',     value: tier,                  inline: true },
          { name: 'tieredBy', value: `<@${tieredByUserId}>`, inline: true },
        )
        .setTimestamp()
        .setFooter({ text: BOT_FOOTER })
      ]
    });
  } catch (_) {}
}

// ═══════════════════════════════════════════════════════════
//  DATABASE  (JSON files in ./paktiers_data/)
// ═══════════════════════════════════════════════════════════

const DATA_DIR     = path.join(__dirname, 'paktiers_data');
const PLAYERS_FILE = path.join(DATA_DIR, 'players.json');
const QUEUE_FILE   = path.join(DATA_DIR, 'queue.json');
const MATCHES_FILE = path.join(DATA_DIR, 'matches.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const init = (f, d) => { if (!fs.existsSync(f)) fs.writeFileSync(f, JSON.stringify(d, null, 2)); };
init(PLAYERS_FILE, {});
init(QUEUE_FILE,   { Mace:[], Crystal:[], Sword:[], Axe:[], Netherite:[] });
init(MATCHES_FILE, []);

const readDB  = f     => JSON.parse(fs.readFileSync(f, 'utf8'));
const writeDB = (f,d) => fs.writeFileSync(f, JSON.stringify(d, null, 2));

const DB = {
  getPlayer:    id  => readDB(PLAYERS_FILE)[id] || null,
  getAllPlayers: ()  => readDB(PLAYERS_FILE),

  registerPlayer(id, ign) {
    const db = readDB(PLAYERS_FILE);
    if (db[id]) return null;
    db[id] = { discordId:id, ign, registeredAt:Date.now(), tiers:{}, queuedIn:[] };
    writeDB(PLAYERS_FILE, db);
    return db[id];
  },

  updateTier(id, weapon, tier) {
    const db = readDB(PLAYERS_FILE);
    if (!db[id]) return null;
    db[id].tiers[weapon] = tier;
    writeDB(PLAYERS_FILE, db);
    return db[id];
  },

  removeTier(id, weapon) {
    const db = readDB(PLAYERS_FILE);
    if (!db[id]) return null;
    delete db[id].tiers[weapon];
    writeDB(PLAYERS_FILE, db);
    return db[id];
  },

  findByIGN(ign) {
    return Object.values(readDB(PLAYERS_FILE))
      .find(p => p.ign.toLowerCase() === ign.toLowerCase()) || null;
  },

  getQueue:    w  => (readDB(QUEUE_FILE)[w] || []),
  getAllQueues: () => readDB(QUEUE_FILE),

  joinQueue(id, weapon) {
    const db = readDB(QUEUE_FILE);
    if (!db[weapon]) db[weapon] = [];
    if (db[weapon].find(e => e.discordId === id)) return { success:false, reason:'already_queued' };
    db[weapon].push({ discordId:id, joinedAt:Date.now() });
    writeDB(QUEUE_FILE, db);
    if (db[weapon].length >= 2) {
      const p1 = db[weapon].shift();
      const p2 = db[weapon].shift();
      writeDB(QUEUE_FILE, db);
      return { success:true, match:[p1, p2] };
    }
    return { success:true, match:null };
  },

  leaveQueue(id, weapon) {
    const db = readDB(QUEUE_FILE);
    if (!db[weapon]) return false;
    const before = db[weapon].length;
    db[weapon] = db[weapon].filter(e => e.discordId !== id);
    writeDB(QUEUE_FILE, db);
    return db[weapon].length < before;
  },

  leaveAllQueues(id) {
    const db = readDB(QUEUE_FILE);
    for (const w of Object.keys(db)) db[w] = db[w].filter(e => e.discordId !== id);
    writeDB(QUEUE_FILE, db);
  },

  createMatch(weapon, p1Id, p2Id) {
    const db = readDB(MATCHES_FILE);
    const match = { id:Date.now(), weapon, players:[p1Id, p2Id], createdAt:Date.now(), status:'ongoing' };
    db.push(match);
    writeDB(MATCHES_FILE, db);
    return match;
  },
};

// ═══════════════════════════════════════════════════════════
//  COMMANDS
// ═══════════════════════════════════════════════════════════

const COMMANDS = {};

// ── /register ────────────────────────────────────────────────
COMMANDS.register = {
  data: new SlashCommandBuilder()
    .setName('register')
    .setDescription('Register your Minecraft Java IGN with PakTiers')
    .addStringOption(o => o.setName('ign').setDescription('Your Minecraft Java username')
      .setRequired(true).setMinLength(3).setMaxLength(16)),

  async execute(interaction) {
    const ign = interaction.options.getString('ign');
    if (!/^[a-zA-Z0-9_]+$/.test(ign)) {
      return interaction.reply({ ephemeral:true, embeds:[new EmbedBuilder()
        .setColor(0xFF4444)
        .setDescription('❌ Invalid IGN. Only letters, numbers and underscores allowed.')] });
    }
    const result = DB.registerPlayer(interaction.user.id, ign);
    if (!result) {
      const ex = DB.getPlayer(interaction.user.id);
      return interaction.reply({ ephemeral:true, embeds:[new EmbedBuilder()
        .setColor(0xFF9933).setTitle('Already Registered')
        .setDescription(`You're already registered as **${ex.ign}**.\nUse \`/profile\` to view your stats.`)] });
    }
    // Pre-fetch UUID in background
    fetchMinecraftUUID(ign).catch(() => {});

    await interaction.reply({ embeds:[new EmbedBuilder()
      .setColor(BRAND_COLOR)
      .setAuthor({ name:'PakTiers · Pakistan Minecraft Community' })
      .setTitle('✅ Registered Successfully!')
      .setDescription(`Welcome to **PakTiers**, **${ign}**! 🇵🇰`)
      .setThumbnail(`https://mc-heads.net/avatar/${ign}/128`)
      .addFields(
        { name:'🎮 IGN',      value:`\`${ign}\``,   inline:true },
        { name:'💻 Platform', value:'Java Edition',  inline:true },
        { name:'🔰 Season',   value:'Season 1',      inline:true },
        { name:'📋 Next Steps', value:'1. Wait for a **Tierer** to evaluate you\n2. Use `/queue join` to find matches\n3. Use `/profile` to view your card' },
      )
      .setFooter({ text: BOT_FOOTER })
      .setTimestamp()] });
  },
};

// ── /profile ─────────────────────────────────────────────────
COMMANDS.profile = {
  data: new SlashCommandBuilder()
    .setName('profile')
    .setDescription("View a player's PakTiers profile")
    .addUserOption(o => o.setName('user').setDescription('Discord user (blank = yourself)').setRequired(false))
    .addStringOption(o => o.setName('ign').setDescription('Search by Minecraft IGN').setRequired(false)),

  async execute(interaction) {
    await interaction.deferReply();
    const ignArg  = interaction.options.getString('ign');
    const userArg = interaction.options.getUser('user');
    let player = ignArg ? DB.findByIGN(ignArg)
               : userArg ? DB.getPlayer(userArg.id)
               : DB.getPlayer(interaction.user.id);

    if (!player) {
      return interaction.editReply({ embeds:[new EmbedBuilder()
        .setColor(0xFF4444).setTitle('❌ Player Not Found')
        .setDescription(ignArg
          ? `No player found with IGN **${ignArg}**.`
          : "That player hasn't registered yet. Use `/register` to get started.")
        .setFooter({ text: BOT_FOOTER })] });
    }

    const tiers       = player.tiers || {};
    const tierEntries = Object.entries(tiers).sort((a,b)=>(TIER_PTS[b[1]]||0)-(TIER_PTS[a[1]]||0));
    const totalPts    = tierEntries.reduce((s,[,t])=>s+(TIER_PTS[t]||0), 0);
    const rank        = getRankTitle(totalPts);
    const bestTier    = tierEntries[0]?.[1];
    const color       = bestTier ? TIER_COLOR[bestTier] : BRAND_COLOR;

    let weaponBlock = tierEntries.length === 0
      ? '```\nNo tiers assigned yet.\nContact a Tierer to get evaluated!\n```'
      : '```\n' + tierEntries.map(([w,t]) =>
          `${w.padEnd(11)} ${getTierLabel(t).padEnd(8)}  ${TIER_BAR[t]||'▱▱▱▱▱▱▱▱▱▱'}  +${TIER_PTS[t]}pt`
        ).join('\n') + '\n```';

    const ranked = Object.values(DB.getAllPlayers())
      .filter(p=>Object.keys(p.tiers||{}).length>0)
      .map(p=>({ ...p, pts:Object.values(p.tiers||{}).reduce((s,t)=>s+(TIER_PTS[t]||0),0) }))
      .sort((a,b)=>b.pts-a.pts);
    const lbPos = ranked.findIndex(p=>p.discordId===player.discordId)+1;
    const lbStr = lbPos>0 ? `#${lbPos} of ${ranked.length}` : 'Unranked';

    await interaction.editReply({ embeds:[new EmbedBuilder()
      .setColor(color)
      .setAuthor({ name:'PakTiers · Pakistan Minecraft Community' })
      .setTitle(`${rank.emoji}  ${player.ign}`)
      .setDescription(`**${rank.label}**\n⭐ **${totalPts} pts**  ·  🏅 **Rank ${lbStr}**  ·  🇵🇰 **Pakistan**`)
      .addFields(
        { name:'⚔️  Weapon Disciplines', value:weaponBlock },
        { name:'🎮  Platform',   value:'Java Edition', inline:true },
        { name:'📅  Registered', value:`<t:${Math.floor(player.registeredAt/1000)}:D>`, inline:true },
        { name:'🔰  Season',     value:'Season 1', inline:true },
      )
      .setThumbnail(`https://mc-heads.net/avatar/${player.ign}/128`)
      .setFooter({ text: BOT_FOOTER })
      .setTimestamp()] });
  },
};

// ── /tier ────────────────────────────────────────────────────
COMMANDS.tier = {
  data: new SlashCommandBuilder()
    .setName('tier')
    .setDescription('Tier management (Tierer role required)')
    .addSubcommand(s=>s.setName('set').setDescription("Set a player's tier")
      .addUserOption(o=>o.setName('player').setDescription('Discord user').setRequired(true))
      .addStringOption(o=>o.setName('weapon').setDescription('Weapon').setRequired(true)
        .addChoices(...WEAPONS.map(w=>({name:w,value:w}))))
      .addStringOption(o=>o.setName('tier').setDescription('Tier').setRequired(true)
        .addChoices(...TIERS.map(t=>({name:t,value:t})))))
    .addSubcommand(s=>s.setName('remove').setDescription("Remove a player's tier")
      .addUserOption(o=>o.setName('player').setDescription('Discord user').setRequired(true))
      .addStringOption(o=>o.setName('weapon').setDescription('Weapon').setRequired(true)
        .addChoices(...WEAPONS.map(w=>({name:w,value:w})))))
    .addSubcommand(s=>s.setName('view').setDescription('View all tiers for a player')
      .addUserOption(o=>o.setName('player').setDescription('Discord user').setRequired(true))),

  async execute(interaction) {
    const isAdmin       = interaction.member.permissions.has(PermissionFlagsBits.Administrator);
    const hasTiererRole = CONFIG.TIERER_ROLE_ID
      ? interaction.member.roles.cache.has(CONFIG.TIERER_ROLE_ID) : false;
    if (!isAdmin && !hasTiererRole) {
      return interaction.reply({ ephemeral:true, embeds:[new EmbedBuilder()
        .setColor(0xFF4444)
        .setDescription('❌ You need the **Tierer** role to use tier commands.')] });
    }

    const sub    = interaction.options.getSubcommand();
    const target = interaction.options.getUser('player');
    const weapon = interaction.options.getString('weapon');
    const tier   = interaction.options.getString('tier');
    let player   = DB.getPlayer(target.id);

    // /tier view
    if (sub === 'view') {
      if (!player) return interaction.reply({ ephemeral:true, embeds:[new EmbedBuilder()
        .setColor(0xFF4444).setDescription(`❌ **${target.username}** is not registered.`)] });
      const entries = Object.entries(player.tiers||{}).sort((a,b)=>(TIER_PTS[b[1]]||0)-(TIER_PTS[a[1]]||0));
      const pts     = entries.reduce((s,[,t])=>s+(TIER_PTS[t]||0),0);
      const tierStr = entries.length
        ? entries.map(([w,t])=>`${WEAPON_EMOJI[w]} **${w}** — ${getTierLabel(t)} \`${t}\``).join('\n')
        : '*No tiers assigned*';
      return interaction.reply({ embeds:[new EmbedBuilder()
        .setColor(BRAND_COLOR).setTitle(`📋 Tiers — ${player.ign}`)
        .setThumbnail(`https://mc-heads.net/avatar/${player.ign}/128`)
        .setDescription(tierStr).setFooter({ text:`Total: ${pts} pts` })] });
    }

    // /tier set
    if (sub === 'set') {
      if (!player) return interaction.reply({ ephemeral:true, embeds:[new EmbedBuilder()
        .setColor(0xFF4444).setDescription(`❌ **${target.username}** is not registered. They must \`/register\` first.`)] });
      const oldTier  = player.tiers?.[weapon];
      DB.updateTier(target.id, weapon, tier);
      const pts      = TIER_PTS[tier];
      const color    = TIER_COLOR[tier] || BRAND_COLOR;
      const isUpdate = !!oldTier;

      await interaction.reply({ embeds:[new EmbedBuilder()
        .setColor(color)
        .setTitle(isUpdate ? '🔄 Tier Updated' : '✅ Tier Assigned')
        .setThumbnail(`https://mc-heads.net/avatar/${player.ign}/128`)
        .addFields(
          { name:'Player', value:`**${player.ign}** (<@${target.id}>)`, inline:true },
          { name:'Weapon', value:`${WEAPON_EMOJI[weapon]} ${weapon}`, inline:true },
          { name:'\u200b', value:'\u200b', inline:true },
          isUpdate
            ? { name:'Change', value:`\`${oldTier}\` → \`${tier}\` (+${pts}pts)`, inline:true }
            : { name:'Tier',   value:`\`${tier}\` — ${getTierLabel(tier)} (+${pts}pts)`, inline:true },
          { name:'Tiered By', value:`<@${interaction.user.id}>`, inline:true },
          { name:'mctiers Gamemode', value:`\`${WEAPON_TO_MCTIERS[weapon]}\``, inline:true },
        )
        .setFooter({ text: BOT_FOOTER }).setTimestamp()] });

      // ── MOD SYNC EMBED ──────────────────────────────────────
      // Ye embed mod ka DiscordPoller read karta hai
      // UUID fetch + structured fields = precise cache refresh
      await postTierSyncEmbed(interaction.client, player, weapon, tier, interaction.user.id);
      // ────────────────────────────────────────────────────────

      // Player ko DM
      try {
        await target.send({ embeds:[new EmbedBuilder()
          .setColor(color)
          .setTitle(`${WEAPON_EMOJI[weapon]} Your ${weapon} tier has been ${isUpdate?'updated':'assigned'}!`)
          .setDescription(`**${getTierLabel(tier)}** (\`${tier}\`) · +${pts} pts\n\nYou can now use \`/queue join\` for ${weapon}!\n\n*Your tier will auto-update in TierTagger mod within 60 seconds.*`)
          .setFooter({ text: BOT_FOOTER })] });
      } catch(_) {}
      return;
    }

    // /tier remove
    if (sub === 'remove') {
      if (!player || !player.tiers?.[weapon]) {
        return interaction.reply({ ephemeral:true, embeds:[new EmbedBuilder()
          .setColor(0xFF9933)
          .setDescription(`⚠️ **${player?.ign||target.username}** doesn't have a ${weapon} tier to remove.`)] });
      }
      const removedTier = player.tiers[weapon];
      DB.removeTier(target.id, weapon);
      await interaction.reply({ embeds:[new EmbedBuilder()
        .setColor(0xFF4444).setTitle('🗑️ Tier Removed')
        .addFields(
          { name:'Player',       value:`**${player.ign}** (<@${target.id}>)`, inline:true },
          { name:'Weapon',       value:`${WEAPON_EMOJI[weapon]} ${weapon}`,   inline:true },
          { name:'Removed Tier', value:`\`${removedTier}\``,                  inline:true },
          { name:'Removed By',   value:`<@${interaction.user.id}>`,           inline:true },
        ).setTimestamp()] });

      // Sync embed on remove too — mod cache saaf karega
      await postTierSyncEmbed(interaction.client, player, weapon, 'REMOVED', interaction.user.id);
    }
  },
};

// ── /queue ───────────────────────────────────────────────────
COMMANDS.queue = {
  data: new SlashCommandBuilder()
    .setName('queue')
    .setDescription('Queue commands for PakTiers matchmaking')
    .addSubcommand(s=>s.setName('join').setDescription('Join the queue for a weapon')
      .addStringOption(o=>o.setName('weapon').setDescription('Weapon to queue for').setRequired(true)
        .addChoices(...WEAPONS.map(w=>({name:`${WEAPON_EMOJI[w]} ${w}`,value:w})))))
    .addSubcommand(s=>s.setName('leave').setDescription('Leave a queue (or all)')
      .addStringOption(o=>o.setName('weapon').setDescription('Weapon to leave (omit = all)').setRequired(false)
        .addChoices({ name:'🚫 Leave ALL queues', value:'all' }, ...WEAPONS.map(w=>({name:`${WEAPON_EMOJI[w]} ${w}`,value:w})))))
    .addSubcommand(s=>s.setName('status').setDescription('Show current queue status')),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'status') {
      const queues     = DB.getAllQueues();
      const allPlayers = DB.getAllPlayers();
      const fields     = WEAPONS.map(w=>{
        const q = queues[w]||[];
        const list = q.length
          ? q.map((e,i)=>`${i+1}. **${allPlayers[e.discordId]?.ign||'Unknown'}** (<@${e.discordId}>)`).join('\n')
          : '*Empty*';
        return { name:`${WEAPON_EMOJI[w]} ${w} — ${q.length}/2`, value:list, inline:false };
      });
      const total = WEAPONS.reduce((s,w)=>s+(queues[w]?.length||0),0);
      return interaction.reply({ embeds:[new EmbedBuilder()
        .setColor(BRAND_COLOR).setTitle('🏆 PakTiers · Queue Status')
        .setDescription(`**${total}** player${total!==1?'s':''} currently in queue`)
        .addFields(fields).setFooter({ text: BOT_FOOTER }).setTimestamp()] });
    }

    if (sub === 'leave') {
      const player = DB.getPlayer(interaction.user.id);
      if (!player) return interaction.reply({ ephemeral:true, embeds:[new EmbedBuilder()
        .setColor(0xFF4444).setDescription('❌ You are not registered. Use `/register` first.')] });
      const weapon = interaction.options.getString('weapon');
      if (!weapon || weapon === 'all') {
        DB.leaveAllQueues(interaction.user.id);
        return interaction.reply({ ephemeral:true, embeds:[new EmbedBuilder()
          .setColor(0xFF9933).setDescription(`👋 **${player.ign}** has left all queues.`)] });
      }
      const left = DB.leaveQueue(interaction.user.id, weapon);
      return interaction.reply({ ephemeral:true, embeds:[new EmbedBuilder()
        .setColor(left ? 0xFF9933 : 0xFFB800)
        .setDescription(left
          ? `👋 **${player.ign}** left the ${WEAPON_EMOJI[weapon]} **${weapon}** queue.`
          : `⚠️ You were not in the **${weapon}** queue.`)] });
    }

    if (sub === 'join') {
      await interaction.deferReply({ ephemeral:true });
      const weapon = interaction.options.getString('weapon');
      const player = DB.getPlayer(interaction.user.id);

      if (!player) return interaction.editReply({ embeds:[new EmbedBuilder()
        .setColor(0xFF4444).setDescription('❌ You are not registered. Use `/register` first.')] });

      if (!player.tiers?.[weapon]) return interaction.editReply({ embeds:[new EmbedBuilder()
        .setColor(0xFF4444).setTitle('No Tier for this Weapon')
        .setDescription(`You don't have a **${weapon}** tier yet.\nA **Tierer** must evaluate you first.`)
        .addFields({ name:'Your Current Tiers', value:Object.keys(player.tiers||{}).length
          ? Object.entries(player.tiers).map(([w,t])=>`${WEAPON_EMOJI[w]} ${w}: \`${t}\``).join('\n')
          : '*None yet*' })] });

      const result = DB.joinQueue(interaction.user.id, weapon);
      if (!result.success && result.reason==='already_queued') {
        return interaction.editReply({ embeds:[new EmbedBuilder()
          .setColor(0xFF9933).setDescription(`⚠️ You're already in the ${WEAPON_EMOJI[weapon]} **${weapon}** queue.`)] });
      }

      if (result.match) {
        const [e1,e2] = result.match;
        const p1 = DB.getPlayer(e1.discordId);
        const p2 = DB.getPlayer(e2.discordId);
        const match = DB.createMatch(weapon, e1.discordId, e2.discordId);
        const matchEmbed = new EmbedBuilder()
          .setColor(BRAND_COLOR)
          .setTitle(`${WEAPON_EMOJI[weapon]} Match Found! — ${weapon}`)
          .setDescription(`A **1v1 ${weapon}** match has been created!\nBoth players: DM each other or hop on the server.`)
          .addFields(
            { name:'🔵 Player 1', value:`**${p1?.ign||'Unknown'}** (<@${e1.discordId}>)\nTier: \`${p1?.tiers?.[weapon]||'N/A'}\``, inline:true },
            { name:'🔴 Player 2', value:`**${p2?.ign||'Unknown'}** (<@${e2.discordId}>)\nTier: \`${p2?.tiers?.[weapon]||'N/A'}\``, inline:true },
            { name:'Match ID', value:`\`#${match.id}\``, inline:false },
            { name:'📜 Rules', value:'• Java Edition 1v1\n• Standard PvP rules apply\n• Report results to a Tierer\n• No hacks or exploits' },
          )
          .setTimestamp().setFooter({ text:'PakTiers Matchmaking · Good luck! 🇵🇰' });

        if (CONFIG.MATCH_CHANNEL_ID) {
          try {
            const ch = await interaction.client.channels.fetch(CONFIG.MATCH_CHANNEL_ID);
            if (ch) await ch.send({ content:`<@${e1.discordId}> vs <@${e2.discordId}>`, embeds:[matchEmbed] });
          } catch(_){}
        }
        return interaction.editReply({ embeds:[matchEmbed] });
      }

      const q   = DB.getQueue(weapon);
      const pos = q.findIndex(e=>e.discordId===interaction.user.id)+1;
      await interaction.editReply({ embeds:[new EmbedBuilder()
        .setColor(BRAND_COLOR)
        .setTitle(`${WEAPON_EMOJI[weapon]} Joined Queue — ${weapon}`)
        .addFields(
          { name:'Player',    value:`**${player.ign}**`,           inline:true },
          { name:'Your Tier', value:`\`${player.tiers[weapon]}\``, inline:true },
          { name:'Position',  value:`**#${pos}** in queue`,        inline:true },
          { name:'⏳ Status', value:'Waiting for 1 more player…' },
        )
        .setFooter({ text:'Use /queue leave to exit · PakTiers' }).setTimestamp()] });
    }
  },
};

// ── /leaderboard ─────────────────────────────────────────────
COMMANDS.leaderboard = {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('View PakTiers leaderboard')
    .addStringOption(o=>o.setName('weapon').setDescription('Filter by weapon (default: all)').setRequired(false)
      .addChoices({ name:'🏆 All Weapons', value:'all' }, ...WEAPONS.map(w=>({name:`${WEAPON_EMOJI[w]} ${w}`,value:w})))),

  async execute(interaction) {
    await interaction.deferReply();
    const weapon = interaction.options.getString('weapon')||'all';
    let ranked   = Object.values(DB.getAllPlayers()).filter(p=>Object.keys(p.tiers||{}).length>0);

    if (weapon!=='all') {
      ranked = ranked.filter(p=>p.tiers?.[weapon])
        .sort((a,b)=>(TIER_PTS[b.tiers[weapon]]||0)-(TIER_PTS[a.tiers[weapon]]||0));
    } else {
      ranked.sort((a,b)=>{
        const ptsA = Object.values(a.tiers||{}).reduce((s,t)=>s+(TIER_PTS[t]||0),0);
        const ptsB = Object.values(b.tiers||{}).reduce((s,t)=>s+(TIER_PTS[t]||0),0);
        return ptsB-ptsA;
      });
    }

    if (!ranked.length) return interaction.editReply({ embeds:[new EmbedBuilder()
      .setColor(BRAND_COLOR).setDescription('No ranked players yet. Tierers must assign tiers first!')] });

    const medals = ['🥇','🥈','🥉'];
    const rows = ranked.slice(0,10).map((p,i)=>{
      const medal = medals[i]||`**${i+1}.**`;
      if (weapon==='all') {
        const pts = Object.values(p.tiers||{}).reduce((s,t)=>s+(TIER_PTS[t]||0),0);
        const rk  = getRankTitle(pts);
        const icons = Object.keys(p.tiers||{}).map(w=>WEAPON_EMOJI[w]).join('');
        return `${medal} **${p.ign}** · ${icons}\n   ${rk.emoji} ${rk.label} · **${pts} pts**`;
      }
      const tier = p.tiers[weapon];
      return `${medal} **${p.ign}** · \`${tier}\` · ${TIER_PTS[tier]||0} pts`;
    });

    await interaction.editReply({ embeds:[new EmbedBuilder()
      .setColor(BRAND_COLOR)
      .setTitle(weapon==='all' ? '🏆 PakTiers — Overall Leaderboard' : `${WEAPON_EMOJI[weapon]} PakTiers — ${weapon} Leaderboard`)
      .setDescription(rows.join('\n\n'))
      .addFields(
        { name:'Total Ranked', value:`**${ranked.length}** players`, inline:true },
        { name:'Season',       value:'**S1**',                       inline:true },
      )
      .setFooter({ text: BOT_FOOTER }).setTimestamp()] });
  },
};

// ── /help ────────────────────────────────────────────────────
COMMANDS.help = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Show all PakTiers bot commands'),

  async execute(interaction) {
    await interaction.reply({ embeds:[new EmbedBuilder()
      .setColor(BRAND_COLOR)
      .setTitle('🏆 PakTiers Bot — Commands')
      .setDescription("Pakistan's Minecraft Java PvP ranking system 🇵🇰")
      .addFields(
        { name:'👤 Player Commands', value:[
          '`/register <ign>` — Register your Java IGN',
          '`/profile [user] [ign]` — View your or someone\'s profile',
          '`/leaderboard [weapon]` — View overall or per-weapon rankings',
        ].join('\n') },
        { name:'⚔️ Queue Commands', value:[
          '`/queue join <weapon>` — Join the matchmaking queue',
          '`/queue leave [weapon]` — Leave a queue (or all)',
          '`/queue status` — See who\'s currently queued',
        ].join('\n') },
        { name:'🛡️ Tierer Commands', value:[
          '`/tier set <player> <weapon> <tier>` — Assign/update a tier',
          '`/tier remove <player> <weapon>` — Remove a tier',
          '`/tier view <player>` — View all tiers for a player',
          '',
          '*Requires the **Tierer** role.*',
        ].join('\n') },
        { name:'📊 Tiers',   value:'`HT1` › `LT1` › `HT2` › `LT2` › `HT3` › `LT3` › `HT4` › `LT4` › `HT5` › `LT5`' },
        { name:'⚙️ Weapons', value:'🔨 Mace · 💠 Crystal · ⚔️ Sword · 🪓 Axe · 🪨 Netherite' },
        { name:'🔗 TierTagger Sync', value:'Tiers auto-sync to TierTagger mod in-game within ~60 seconds of assignment.' },
      )
      .setFooter({ text: BOT_FOOTER })] });
  },
};

// ═══════════════════════════════════════════════════════════
//  BOT STARTUP
// ═══════════════════════════════════════════════════════════

async function deployCommands() {
  const rest   = new REST({ version:'10' }).setToken(CONFIG.BOT_TOKEN);
  const bodies = Object.values(COMMANDS).map(c => c.data.toJSON());
  await rest.put(Routes.applicationGuildCommands(CONFIG.CLIENT_ID, CONFIG.GUILD_ID), { body:bodies });
  console.log(`✅ Deployed ${bodies.length} slash commands`);
}

const client = new Client({
  intents:[
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
  ],
});

client.once('ready', async () => {
  console.log(`🟢 PakTiers Bot online as ${client.user.tag}`);
  console.log(`📡 Tier sync channel: ${CONFIG.TIER_SYNC_CHANNEL_ID}`);
  client.user.setPresence({ activities:[{ name:'⚔️ /queue join · PakTiers', type:0 }], status:'online' });
  try { await deployCommands(); } catch(e) { console.error('Command deploy error:', e); }
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;
  const cmd = COMMANDS[interaction.commandName];
  if (!cmd) return;
  try {
    await cmd.execute(interaction);
  } catch(err) {
    console.error(`[ERROR] /${interaction.commandName}:`, err);
    const errEmbed = new EmbedBuilder().setColor(0xFF4444)
      .setDescription('❌ Something went wrong. Please try again.');
    if (interaction.replied || interaction.deferred)
      await interaction.followUp({ embeds:[errEmbed], ephemeral:true }).catch(()=>{});
    else
      await interaction.reply({ embeds:[errEmbed], ephemeral:true }).catch(()=>{});
  }
});

client.login(CONFIG.BOT_TOKEN);
