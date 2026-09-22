// ---- Stav ------------------------------------------------------------------
let currentPassword = null; // heslo do trezoru, ak je odomknuté
let editingId = null;

// editTokeny vlastných odkazov, uložené v prehliadači tohto kolegu
const TOKENS_KEY = 'wedding_edit_tokens';
function getTokens() {
  try { return JSON.parse(localStorage.getItem(TOKENS_KEY) || '{}'); }
  catch { return {}; }
}
function saveToken(id, token) {
  const t = getTokens(); t[id] = token; localStorage.setItem(TOKENS_KEY, JSON.stringify(t));
}
function removeToken(id) {
  const t = getTokens(); delete t[id]; localStorage.setItem(TOKENS_KEY, JSON.stringify(t));
}

// ---- Vtipné hlášky ---------------------------------------------------------
const QUOTES = [
  '„Would I rather be feared or loved? Easy. Both." – Michael Scott'
];

// ---- Init ------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('quote').textContent = QUOTES[Math.floor(Math.random() * QUOTES.length)];
  await loadInfo();
  await loadMessages();
  wireEvents();
});

async function loadInfo() {
  try {
    const info = await (await fetch('/api/info')).json();
    if (info.pageTitle) {
      document.getElementById('title').textContent = info.pageTitle;
      document.title = info.pageTitle;
    }
    if (info.weddingDate) {
      const d = new Date(info.weddingDate + 'T00:00:00');
      if (!isNaN(d)) document.getElementById('date').textContent =
        '📅 ' + d.toLocaleDateString('sk-SK', { day: 'numeric', month: 'long', year: 'numeric' });
    }
  } catch { /* info je len kozmetika */ }
}

// ---- Načítanie a vykreslenie ----------------------------------------------
async function loadMessages() {
  const url = currentPassword
    ? '/api/messages?password=' + encodeURIComponent(currentPassword)
    : '/api/messages';
  let data;
  try {
    data = await (await fetch(url)).json();
  } catch {
    return;
  }
  document.getElementById('secretCount').textContent = data.secretCount || 0;
  renderMessages(data.messages);
  updateVaultUI(data.secretUnlocked);
}

function renderMessages(messages) {
  const wrap = document.getElementById('messages');
  const empty = document.getElementById('empty');
  wrap.innerHTML = '';
  document.getElementById('count').textContent = messages.length ? `(${messages.length})` : '';

  if (!messages.length) { empty.classList.remove('hidden'); return; }
  empty.classList.add('hidden');

  const tokens = getTokens();
  messages.forEach((m, i) => {
    const el = document.createElement('article');
    el.className = 'msg' + (m.secret ? ' secret' : '');
    el.style.setProperty('--tilt', `${(i % 2 ? 1 : -1) * (Math.random() * 1.6 + 0.4)}deg`);

    const badge = m.secret ? '<span class="badge">🔒 tajné</span>' : '';
    const edited = m.updatedAt ? ' · upravené' : '';
    const mine = tokens[m.id]
      ? `<button class="edit-link" data-edit="${m.id}">upraviť / zmazať</button>` : '';

    el.innerHTML = `
      ${badge}
      <p class="text"></p>
      <div class="who"></div>
      <div class="meta">${formatDate(m.createdAt)}${edited}</div>
      ${mine}`;
    el.querySelector('.text').textContent = m.text;
    el.querySelector('.who').textContent = '— ' + m.name;
    wrap.appendChild(el);
  });

  wrap.querySelectorAll('[data-edit]').forEach(b =>
    b.addEventListener('click', () => openEdit(b.dataset.edit)));
}

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleDateString('sk-SK', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch { return ''; }
}

// ---- Trezor ----------------------------------------------------------------
function updateVaultUI(unlocked) {
  document.getElementById('vaultLocked').classList.toggle('hidden', unlocked);
  document.getElementById('vaultOpen').classList.toggle('hidden', !unlocked);
}

// ---- Udalosti --------------------------------------------------------------
function wireEvents() {
  document.getElementById('messageForm').addEventListener('submit', onSubmit);
  document.getElementById('unlockBtn').addEventListener('click', onUnlock);
  document.getElementById('unlockPassword').addEventListener('keydown', e => {
    if (e.key === 'Enter') onUnlock();
  });
  document.getElementById('lockBtn').addEventListener('click', () => {
    currentPassword = null;
    loadMessages();
  });
  document.getElementById('cancelEdit').addEventListener('click', closeEdit);
  document.getElementById('saveEdit').addEventListener('click', onSaveEdit);
  document.getElementById('deleteBtn').addEventListener('click', onDelete);
}

async function onSubmit(e) {
  e.preventDefault();
  const msgEl = document.getElementById('formMsg');
  const text = document.getElementById('text').value.trim();
  if (!text) return;

  const btn = document.getElementById('submitBtn');
  btn.disabled = true;
  msgEl.className = 'form-msg';
  msgEl.textContent = 'Posielam...';

  const body = {
    name: document.getElementById('name').value.trim(),
    text,
    secret: document.getElementById('secret').checked
  };

  try {
    const res = await fetch('/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Niečo sa pokazilo.');

    saveToken(data.id, data.editToken);
    e.target.reset();
    msgEl.className = 'form-msg ok';
    msgEl.textContent = body.secret
      ? '🔒 Tajný odkaz uložený! Uvidí ho len ženích.'
      : '✅ Odkaz pridaný! Level Michael Scott.';
    fireConfetti();
    await loadMessages();
  } catch (err) {
    msgEl.className = 'form-msg err';
    msgEl.textContent = '⚠️ ' + err.message;
  } finally {
    btn.disabled = false;
  }
}

async function onUnlock() {
  const pwd = document.getElementById('unlockPassword').value;
  const msgEl = document.getElementById('unlockMsg');
  msgEl.className = 'form-msg';
  msgEl.textContent = 'Overujem...';
  try {
    const res = await fetch('/api/unlock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pwd })
    });
    const data = await res.json();
    if (data.ok) {
      currentPassword = pwd;
      document.getElementById('unlockPassword').value = '';
      msgEl.textContent = '';
      await loadMessages();
      fireConfetti();
    } else {
      msgEl.className = 'form-msg err';
      msgEl.textContent = '❌ Nesprávne heslo. Identity theft is not a joke, Jim!';
    }
  } catch {
    msgEl.className = 'form-msg err';
    msgEl.textContent = '⚠️ Chyba pri overovaní.';
  }
}

// ---- Úprava / mazanie vlastného odkazu -------------------------------------
async function openEdit(id) {
  // načítame aktuálne dáta odkazu z vykreslenej karty nie je spoľahlivé pri tajných,
  // preto si vytiahneme z aktuálneho zoznamu cez fetch
  const url = currentPassword
    ? '/api/messages?password=' + encodeURIComponent(currentPassword)
    : '/api/messages';
  const data = await (await fetch(url)).json();
  const m = data.messages.find(x => x.id === id);
  if (!m) return;

  editingId = id;
  document.getElementById('editName').value = m.name === 'Anonymný kolega' ? '' : m.name;
  document.getElementById('editText').value = m.text;
  document.getElementById('editSecret').checked = m.secret;
  document.getElementById('editModal').classList.remove('hidden');
}

function closeEdit() {
  editingId = null;
  document.getElementById('editModal').classList.add('hidden');
}

async function onSaveEdit() {
  if (!editingId) return;
  const token = getTokens()[editingId];
  const body = {
    editToken: token,
    name: document.getElementById('editName').value.trim(),
    text: document.getElementById('editText').value.trim(),
    secret: document.getElementById('editSecret').checked
  };
  if (!body.text) return;
  const res = await fetch('/api/messages/' + editingId, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (res.ok) {
    closeEdit();
    await loadMessages();
  } else {
    const d = await res.json().catch(() => ({}));
    alert(d.error || 'Nepodarilo sa uložiť.');
  }
}

async function onDelete() {
  if (!editingId) return;
  if (!confirm('Naozaj zmazať tento odkaz? „No, God! No, God, please no!" – Michael')) return;
  const token = getTokens()[editingId];
  const res = await fetch('/api/messages/' + editingId, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ editToken: token })
  });
  if (res.ok) {
    removeToken(editingId);
    closeEdit();
    await loadMessages();
  } else {
    alert('Nepodarilo sa zmazať.');
  }
}

// ---- Konfety ---------------------------------------------------------------
function fireConfetti() {
  const canvas = document.getElementById('confetti');
  const ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  const colors = ['#1f6f5c', '#6b4ea3', '#e8b53d', '#d9604a', '#3b8ea5'];
  const pieces = Array.from({ length: 120 }, () => ({
    x: Math.random() * canvas.width,
    y: -20 - Math.random() * canvas.height * 0.3,
    r: 4 + Math.random() * 6,
    c: colors[Math.floor(Math.random() * colors.length)],
    vy: 2 + Math.random() * 3,
    vx: -1.5 + Math.random() * 3,
    rot: Math.random() * Math.PI,
    vr: -0.2 + Math.random() * 0.4
  }));

  let frame = 0;
  (function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    pieces.forEach(p => {
      p.x += p.vx; p.y += p.vy; p.rot += p.vr;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.c;
      ctx.fillRect(-p.r / 2, -p.r / 2, p.r, p.r * 0.6);
      ctx.restore();
    });
    frame++;
    if (frame < 180) requestAnimationFrame(draw);
    else ctx.clearRect(0, 0, canvas.width, canvas.height);
  })();
}
