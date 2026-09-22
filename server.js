const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

const DATA_DIR = path.join(__dirname, 'data');
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

// --- Úložisko (jednoduchý JSON súbor) ---------------------------------------
function ensureStore() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, '[]', 'utf8');
}

function readMessages() {
  ensureStore();
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function writeMessages(messages) {
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
app.get('/api/messages', (req, res) => {
  const messages = readMessages();
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
app.post('/api/messages', (req, res) => {
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

  const messages = readMessages();
  messages.push(message);
  writeMessages(messages);

  // editToken sa vracia iba autorovi hneď po vytvorení (uloží sa mu v prehliadači)
  res.status(201).json({ ...publicView(message), editToken: message.editToken });
});

// Úprava vlastného odkazu (treba editToken)
app.put('/api/messages/:id', (req, res) => {
  const messages = readMessages();
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
  writeMessages(messages);
  res.json(publicView(m));
});

// Zmazanie vlastného odkazu (treba editToken)
app.delete('/api/messages/:id', (req, res) => {
  const messages = readMessages();
  const idx = messages.findIndex(x => x.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Tento odkaz sme nenašli.' });
  if (messages[idx].editToken !== req.body.editToken) {
    return res.status(403).json({ error: 'Toto nie je tvoj odkaz.' });
  }
  messages.splice(idx, 1);
  writeMessages(messages);
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`\n  Svadobná kartička beží na  http://localhost:${PORT}`);
  console.log(`  (Dunder Mifflin. This is wedding.)\n`);
});
