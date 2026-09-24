const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// Kam sa ukladajú odkazy. Na Renderi nastav DATA_DIR na cestu pripojeného
// Persistent Disku (napr. /var/data), aby odkazy prežili reštart/uspatie.
// Lokálne (bez premennej) sa použije priečinok ./data ako doteraz.
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'messages.json');
const CONFIG_FILE = path.join(__dirname, 'config.json');

app.use(express.json({ limit: '100kb' }));
app.use(express.static(path.join(__dirname, 'public')));

// --- Konfigurácia -----------------------------------------------------------
function loadConfig() {
  const cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  // Heslo z prostredia (napr. na Renderi) má prednosť pred config.json
  if (process.env.SECRET_PASSWORD) cfg.secretPassword = process.env.SECRET_PASSWORD;
  return cfg;
}

// --- Úložisko ---------------------------------------------------------------
// Ak je nastavená premenná DATABASE_URL (Render Postgres), odkazy sa ukladajú
// do databázy → prežijú reštart aj uspatie na Render free tieri.
// Inak (napr. lokálne u teba na počítači) sa použije súbor ./data/messages.json.
const DATABASE_URL = process.env.DATABASE_URL;
const useDb = !!DATABASE_URL;
const STORE_KEY = 'messages';

let pool = null;
let tableReady = null;
if (useDb) {
  const { Pool } = require('pg');
  pool = new Pool({
    connectionString: DATABASE_URL,
    // Render vyžaduje SSL; lokálny Postgres nie.
    ssl: /localhost|127\.0\.0\.1/.test(DATABASE_URL) ? false : { rejectUnauthorized: false }
  });
}

// Vytvorí tabuľku (raz). Odkazy držíme ako jeden JSON záznam — jednoduché a stačí.
function ensureTable() {
  if (!tableReady) {
    tableReady = pool.query(
      'CREATE TABLE IF NOT EXISTS store (id TEXT PRIMARY KEY, data JSONB NOT NULL)'
    );
  }
  return tableReady;
}

function ensureStore() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, '[]', 'utf8');
}

async function readMessages() {
  if (useDb) {
    await ensureTable();
    const { rows } = await pool.query('SELECT data FROM store WHERE id = $1', [STORE_KEY]);
    return rows.length ? rows[0].data : [];
  }
  ensureStore();
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return [];
  }
}

async function writeMessages(messages) {
  if (useDb) {
    await ensureTable();
    await pool.query(
      'INSERT INTO store (id, data) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data',
      [STORE_KEY, JSON.stringify(messages)]
    );
    return;
  }
  ensureStore();
  fs.writeFileSync(DATA_FILE, JSON.stringify(messages, null, 2), 'utf8');
}

// Bezpečné porovnanie hesla (odolné voči časovaniu)
function passwordMatches(input) {
  const cfg = loadConfig();
  const expected = String(cfg.secretPassword || '');
  const given = String(input || '');
  if (expected.length === 0) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(given);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// Verejná verzia odkazu (nikdy neposiela editToken)
function publicView(m) {
  return {
    id: m.id,
    name: m.name || 'Anonymný kolega',
    text: m.text,
    secret: !!m.secret,
    createdAt: m.createdAt,
    updatedAt: m.updatedAt || null
  };
}

function clean(str, max) {
  return String(str == null ? '' : str).trim().slice(0, max);
}

// --- API --------------------------------------------------------------------

// Info o stránke (mená, dátum, titulok) — bez hesla
app.get('/api/info', (req, res) => {
  const cfg = loadConfig();
  res.json({
    groomName: cfg.groomName,
    brideName: cfg.brideName,
    weddingDate: cfg.weddingDate,
    pageTitle: cfg.pageTitle
  });
});

// Zoznam odkazov. Verejné vždy; tajné iba pri správnom hesle.
app.get('/api/messages', async (req, res) => {
  let messages;
  try {
    messages = await readMessages();
  } catch {
    // Napr. databáza dočasne nedostupná — nech stránka nezamrzne.
    return res.status(503).json({ error: 'Odkazy sa práve nedajú načítať. Skús to o chvíľu.' });
  }
  const unlocked = passwordMatches(req.query.password);
  const visible = messages.filter(m => !m.secret || unlocked);
  res.json({
    secretUnlocked: unlocked,
    secretCount: messages.filter(m => m.secret).length,
    messages: visible.map(publicView)
  });
});

// Overenie hesla (pre tlačidlo "Odomknúť tajný trezor")
app.post('/api/unlock', (req, res) => {
  res.json({ ok: passwordMatches(req.body.password) });
});

// Pridanie odkazu
app.post('/api/messages', async (req, res) => {
  const text = clean(req.body.text, 2000);
  if (!text) return res.status(400).json({ error: 'Odkaz nemôže byť prázdny. Aj Kevin by niečo napísal.' });

  const message = {
    id: crypto.randomUUID(),
    name: clean(req.body.name, 80) || 'Anonymný kolega',
    text,
    secret: !!req.body.secret,
    createdAt: new Date().toISOString(),
    updatedAt: null,
    editToken: crypto.randomBytes(24).toString('hex')
  };

  try {
    const messages = await readMessages();
    messages.push(message);
    await writeMessages(messages);
  } catch {
    return res.status(500).json({ error: 'Nepodarilo sa uložiť odkaz. Skús to prosím znova.' });
  }

  // editToken sa vracia iba autorovi hneď po vytvorení (uloží sa mu v prehliadači)
  res.status(201).json({ ...publicView(message), editToken: message.editToken });
});

// Úprava vlastného odkazu (treba editToken)
app.put('/api/messages/:id', async (req, res) => {
  const messages = await readMessages();
  const m = messages.find(x => x.id === req.params.id);
  if (!m) return res.status(404).json({ error: 'Tento odkaz sme nenašli.' });
  if (m.editToken !== req.body.editToken) {
    return res.status(403).json({ error: 'Toto nie je tvoj odkaz. Identity theft is not a joke, Jim!' });
  }
  const text = clean(req.body.text, 2000);
  if (!text) return res.status(400).json({ error: 'Odkaz nemôže byť prázdny.' });

  m.text = text;
  if (req.body.name !== undefined) m.name = clean(req.body.name, 80) || 'Anonymný kolega';
  if (req.body.secret !== undefined) m.secret = !!req.body.secret;
  m.updatedAt = new Date().toISOString();
  try {
    await writeMessages(messages);
  } catch {
    return res.status(500).json({ error: 'Nepodarilo sa uložiť zmenu. Skús to prosím znova.' });
  }
  res.json(publicView(m));
});

// Zmazanie vlastného odkazu (treba editToken)
app.delete('/api/messages/:id', async (req, res) => {
  const messages = await readMessages();
  const idx = messages.findIndex(x => x.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Tento odkaz sme nenašli.' });
  if (messages[idx].editToken !== req.body.editToken) {
    return res.status(403).json({ error: 'Toto nie je tvoj odkaz.' });
  }
  messages.splice(idx, 1);
  try {
    await writeMessages(messages);
  } catch {
    return res.status(500).json({ error: 'Nepodarilo sa zmazať odkaz. Skús to prosím znova.' });
  }
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`\n  Svadobná kartička beží na  http://localhost:${PORT}`);
  console.log(`  (Dunder Mifflin. This is wedding.)\n`);
});
