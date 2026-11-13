import http from 'node:http';
import crypto from 'node:crypto';
import admin from 'firebase-admin';
import pino from 'pino';
import QRCode from 'qrcode';
import baileys from '@whiskeysockets/baileys';
import { useFirestoreAuthState } from './authstate.js';
import { makeCore, chatKey, clean } from './core.js';

const { makeWASocket, DisconnectReason, fetchLatestBaileysVersion, makeCacheableSignalKeyStore } = baileys;
const { FIREBASE_SERVICE_ACCOUNT, BOT_URL, BOT_SECRET, GW_KEY, PORT = 3000, HANDOFF_MIN = '15' } = process.env;
for (const [k, v] of Object.entries({ FIREBASE_SERVICE_ACCOUNT, BOT_URL, BOT_SECRET, GW_KEY })) if (!v) { console.error('Falta la variable ' + k); process.exit(1); }

admin.initializeApp({ credential: admin.credential.cert(JSON.parse(FIREBASE_SERVICE_ACCOUNT)) });
const db = admin.firestore();
const logger = pino({ level: 'warn' });

let sock = null, st = { state: 'iniciando', qr: '', me: '', since: Date.now() }, authApi = null, reconnects = 0;

// ---- copia de la conversación para el POS (colección pos_wachats) ----
async function mirror({ sender, name, role, text }) {
  try {
    const ref = db.collection('pos_wachats').doc(chatKey(sender)), ex = await ref.get(), o = ex.exists ? ex.data() : {};
    const digits = String(sender).replace(/\D/g, ''), known = digits.length >= 10 && digits.length === String(sender).replace(/[\s+\-()]/g, '').length;
    const msgs = (Array.isArray(o.msgs) ? o.msgs : []).concat([{ r: role, t: String(text).slice(0, 1500) }]).slice(-60);
    await ref.set({ sender: clean(sender, 60), phone: o.phone || (known ? digits.slice(-10) : ''), name: o.name || name || '', msgs, at: Date.now(), lastOrder: o.lastOrder || '' });
  } catch (e) { console.error('mirror', e && e.message); }
}

async function askBot({ sender, message, name }) {
  const r = await fetch(BOT_URL.replace(/\/+$/, '') + '/api/bot', {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-secret': BOT_SECRET },
    body: JSON.stringify({ query: { sender, message, name, isGroup: false } }), signal: AbortSignal.timeout(60000)
  });
  if (!r.ok) throw new Error('bot HTTP ' + r.status);
  const j = await r.json();
  return Array.isArray(j.replies) ? j.replies : [];
}

async function sendText(jid, text, opt = {}) {
  if (!sock || st.state !== 'open') throw new Error('WhatsApp no está conectado');
  if (!opt.quick) { try { await sock.sendPresenceUpdate('composing', jid); } catch (e) {} await new Promise(r => setTimeout(r, Math.min(3500, 600 + text.length * 15))); }
  const m = await sock.sendMessage(jid, { text });
  try { await sock.sendPresenceUpdate('paused', jid); } catch (e) {}
  return m && m.key && m.key.id;
}

const core = makeCore({ askBot, sendText, mirror, handoffMin: +HANDOFF_MIN });

async function start() {
  authApi = authApi || await useFirestoreAuthState(db);
  const { state, saveCreds } = authApi;
  let version; try { version = (await fetchLatestBaileysVersion()).version; } catch (e) {}
  sock = makeWASocket({
    version, logger, printQRInTerminal: false, browser: ['Comidas El Carbon', 'Chrome', '1.0'],
    auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, logger) },
    markOnlineOnConnect: false, syncFullHistory: false, generateHighQualityLinkPreview: false
  });
  sock.ev.on('creds.update', () => saveCreds().catch(e => console.error('creds', e.message)));
  sock.ev.on('connection.update', async u => {
    if (u.qr) { st.qr = u.qr; st.state = 'qr'; }
    if (u.connection === 'open') { st = { state: 'open', qr: '', me: String((sock.user && sock.user.id) || '').split(':')[0].split('@')[0], since: Date.now() }; reconnects = 0; console.log('WhatsApp conectado:', st.me); }
    if (u.connection === 'close') {
      const code = u.lastDisconnect && u.lastDisconnect.error && u.lastDisconnect.error.output && u.lastDisconnect.error.output.statusCode;
      st = { state: 'cerrado', qr: '', me: '', since: Date.now() };
      if (code === DisconnectReason.loggedOut) {
        console.log('Sesión cerrada desde el celular: se borra y se pide un QR nuevo');
        try { await authApi.clear(); } catch (e) {}
        authApi = null;
        setTimeout(() => start().catch(e => console.error(e)), 1500);
      } else {
        reconnects++;
        setTimeout(() => start().catch(e => console.error(e)), Math.min(30000, 1500 * reconnects));
      }
    }
  });
  sock.ev.on('messages.upsert', ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const m of messages) core.onMessage(m).catch(e => console.error('msg', e && e.message));
  });
}

// ---- servidor web: pantalla del QR, estado y envío desde el POS ----
const okKey = k => { const a = Buffer.from(String(k || '')), b = Buffer.from(GW_KEY); return a.length === b.length && crypto.timingSafeEqual(a, b); };
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type,x-key', 'access-control-allow-methods': 'GET,POST,OPTIONS' };
const json = (res, code, o) => { res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...cors }); res.end(JSON.stringify(o)); };
const readBody = req => new Promise(r => { let b = ''; req.on('data', c => { b += c; if (b.length > 20000) req.destroy(); }); req.on('end', () => { try { r(JSON.parse(b || '{}')); } catch (e) { r({}); } }); });

http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x'), key = u.searchParams.get('key') || req.headers['x-key'];
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  if (u.pathname === '/' || u.pathname === '/health') return json(res, 200, { ok: true });
  if (!okKey(key)) return json(res, 401, { error: 'clave' });
  if (u.pathname === '/status') return json(res, 200, { state: st.state, me: st.me, qr: !!st.qr });
  if (u.pathname === '/send' && req.method === 'POST') {
    const b = await readBody(req);
    try { await core.sendFromPos(b.to, b.text); return json(res, 200, { ok: true }); }
    catch (e) { return json(res, 400, { error: e.message }); }
  }
  if (u.pathname === '/logout' && req.method === 'POST') {
    try { await sock.logout(); } catch (e) {}
    return json(res, 200, { ok: true });
  }
  if (u.pathname === '/qr') {
    let body;
    if (st.state === 'open') body = `<h2>✅ WhatsApp conectado</h2><p>Número: <b>+${st.me}</b></p><p>Ya puedes cerrar esta página. El POS y el bot usan esta conexión.</p><button onclick="if(confirm('¿Desvincular este WhatsApp?'))fetch('/logout?key=${encodeURIComponent(String(key))}',{method:'POST'}).then(()=>location.reload())">Desvincular</button>`;
    else if (st.qr) { const img = await QRCode.toDataURL(st.qr, { width: 320, margin: 2 }); body = `<h2>Escanea este código</h2><img src="${img}" width="320" height="320" alt="QR"><ol style="text-align:left;max-width:340px;margin:12px auto"><li>Abre WhatsApp en el celular del negocio</li><li>Ajustes → <b>Dispositivos vinculados</b></li><li><b>Vincular un dispositivo</b> y apunta a este código</li></ol><p style="color:#888">El código cambia cada ~20 segundos; esta página se actualiza sola.</p>`; }
    else body = `<h2>Conectando…</h2><p>Estado: ${st.state}. Espera unos segundos.</p>`;
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    return res.end(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Conectar WhatsApp</title>${st.state === 'open' ? '' : '<meta http-equiv="refresh" content="4">'}<body style="font-family:system-ui;text-align:center;padding:24px">${body}</body>`);
  }
  json(res, 404, { error: 'no existe' });
}).listen(+PORT, () => console.log('Servidor en puerto', PORT));

process.on('unhandledRejection', e => console.error('unhandled', e && e.message));
start().catch(e => { console.error('inicio', e); process.exit(1); });
