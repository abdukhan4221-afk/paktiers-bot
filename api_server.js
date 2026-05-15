// ============================================================
//  PakTiers API Server
// ============================================================

const express = require('express');
const cors = require('cors');
const http = require('http');
const WebSocket = require('ws');
const chokidar = require('chokidar');
const fs = require('fs');
const path = require('path');

// IMPORTANT FOR RAILWAY
const PORT = process.env.PORT || 3001;

const DATA_DIR = path.join(__dirname, 'paktiers_data');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// ============================================================
// CORS
// ============================================================

app.use(cors({
  origin: [
    'https://paktierslist.netlify.app'
  ]
}));

app.use(express.json());

// ============================================================
// HELPERS
// ============================================================

const readDB = (file) => {
  try {
    return JSON.parse(
      fs.readFileSync(path.join(DATA_DIR, file), 'utf8')
    );
  } catch (err) {
    return null;
  }
};

const TIER_PTS = {
  HT1:10,
  LT1:9,
  HT2:8,
  LT2:7,
  HT3:6,
  LT3:5,
  HT4:4,
  LT4:3,
  HT5:2,
  LT5:1,
};

const TIER_COLOR = {
  HT1:'#FF6B00',
  LT1:'#FF9933',
  HT2:'#FFB800',
  LT2:'#FFD700',
  HT3:'#00C864',
  LT3:'#00A550',
  HT4:'#4FC3F7',
  LT4:'#29B6F6',
  HT5:'#888888',
  LT5:'#555555',
};

function getRankTitle(pts) {
  if (pts >= 101) return {
    label:'COMBAT ACE',
    emoji:'🔥'
  };

  if (pts >= 51) return {
    label:'COMBAT SPECIALIST',
    emoji:'⚡'
  };

  if (pts >= 26) return {
    label:'COMBAT CADET',
    emoji:'🟢'
  };

  if (pts >= 10) return {
    label:'COMBAT NOICE',
    emoji:'🔵'
  };

  return {
    label:'ROOKIE',
    emoji:'⚪'
  };
}

// ============================================================
// API ROUTES
// ============================================================

// LEADERBOARD
app.get('/api/leaderboard', (req, res) => {

  const players = readDB('players.json');

  if (!players) {
    return res.status(500).json({
      error: 'Data unavailable'
    });
  }

  const weapon = req.query.weapon || 'all';

  let ranked = Object.values(players)
    .filter(p => Object.keys(p.tiers || {}).length > 0);

  if (weapon !== 'all') {

    ranked = ranked
      .filter(p => p.tiers?.[weapon])
      .sort((a, b) =>
        (TIER_PTS[b.tiers[weapon]] || 0) -
        (TIER_PTS[a.tiers[weapon]] || 0)
      );

  } else {

    ranked.sort((a, b) => {

      const ptsA = Object.values(a.tiers || {})
        .reduce((s, t) => s + (TIER_PTS[t] || 0), 0);

      const ptsB = Object.values(b.tiers || {})
        .reduce((s, t) => s + (TIER_PTS[t] || 0), 0);

      return ptsB - ptsA;
    });
  }

  const result = ranked.map((p, i) => {

    const pts = Object.values(p.tiers || {})
      .reduce((s, t) => s + (TIER_PTS[t] || 0), 0);

    const rank = getRankTitle(pts);

    return {
      rank: i + 1,
      ign: p.ign,
      tiers: p.tiers || {},
      totalPts: pts,
      rankTitle: rank,
      avatar: `https://mc-heads.net/avatar/${p.ign}/64`,
      tierColors: Object.fromEntries(
        Object.entries(p.tiers || {})
          .map(([w, t]) => [w, TIER_COLOR[t] || '#888'])
      )
    };
  });

  res.json({
    weapon,
    players: result,
    total: result.length,
    updatedAt: Date.now()
  });

});

// PLAYER
app.get('/api/player/:ign', (req, res) => {

  const players = readDB('players.json');

  if (!players) {
    return res.status(500).json({
      error: 'Data unavailable'
    });
  }

  const player = Object.values(players)
    .find(p =>
      p.ign.toLowerCase() ===
      req.params.ign.toLowerCase()
    );

  if (!player) {
    return res.status(404).json({
      error: 'Player not found'
    });
  }

  const pts = Object.values(player.tiers || {})
    .reduce((s, t) => s + (TIER_PTS[t] || 0), 0);

  const rank = getRankTitle(pts);

  res.json({
    ign: player.ign,
    tiers: player.tiers || {},
    totalPts: pts,
    rankTitle: rank,
    avatar: `https://mc-heads.net/avatar/${player.ign}/128`,
    registeredAt: player.registeredAt
  });

});

// QUEUE
app.get('/api/queue', (req, res) => {

  const queues = readDB('queue.json');
  const players = readDB('players.json');

  if (!queues) {
    return res.status(500).json({
      error: 'Data unavailable'
    });
  }

  const result = {};

  for (const [weapon, entries] of Object.entries(queues)) {

    result[weapon] = entries.map(e => ({
      ign: players?.[e.discordId]?.ign || 'Unknown',
      joinedAt: e.joinedAt
    }));

  }

  res.json({
    queues: result,
    updatedAt: Date.now()
  });

});

// STATS
app.get('/api/stats', (req, res) => {

  const players = readDB('players.json') || {};
  const queues = readDB('queue.json') || {};
  const matches = readDB('matches.json') || [];

  const totalPlayers = Object.keys(players).length;

  const tieredPlayers = Object.values(players)
    .filter(p => Object.keys(p.tiers || {}).length > 0)
    .length;

  const queuedNow = Object.values(queues)
    .reduce((s, q) => s + q.length, 0);

  const totalMatches = matches.length;

  res.json({
    totalPlayers,
    tieredPlayers,
    queuedNow,
    totalMatches,
    updatedAt: Date.now()
  });

});

// ============================================================
// WEBSOCKET
// ============================================================

function broadcast(type, data) {

  const msg = JSON.stringify({
    type,
    data,
    ts: Date.now()
  });

  wss.clients.forEach(client => {

    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }

  });

}

wss.on('connection', (ws) => {

  console.log('🌐 Website connected');

  const players = readDB('players.json') || {};

  ws.send(JSON.stringify({
    type: 'init',
    data: {
      playerCount: Object.keys(players).length
    }
  }));

});

// ============================================================
// FILE WATCHER
// ============================================================

chokidar
  .watch(DATA_DIR, {
    ignoreInitial: true
  })
  .on('change', (filePath) => {

    const file = path.basename(filePath);

    console.log(`📁 Updated: ${file}`);

    if (file === 'players.json') {

      broadcast('tier_updated', {
        message: 'Tiers updated'
      });

    }

    if (file === 'queue.json') {

      broadcast('queue_updated', {
        message: 'Queue updated'
      });

    }

    if (file === 'matches.json') {

      broadcast('match_created', {
        message: 'New match'
      });

    }

  });

// ============================================================
// START SERVER
// ============================================================

server.listen(PORT, '0.0.0.0', () => {

  console.log(`✅ API running on port ${PORT}`);
  console.log(`📡 WebSocket ready`);
  console.log(`📂 Watching: ${DATA_DIR}`);

});
