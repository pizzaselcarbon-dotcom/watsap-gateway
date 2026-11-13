import assert from 'node:assert/strict';
import { makeCore, toJid, senderOf, textOf, chatKey } from './core.js';
import { useFirestoreAuthState } from './authstate.js';
let ok = 0; const t = (n, c) => { assert.ok(c, n); ok++; console.log('OK  ', n); };
const mk = (over = {}) => {
  const log = { sent: [], mir: [], asked: [] }; let clock = 1e12, nid = 0;
  const core = makeCore({ now: () => clock, log: { error() {} }, handoffMin: 15,
    askBot: async q => { log.asked.push(q); return over.replies || [{ message: 'Hola, ¿qué deseas?' }, { message: 'Segundo' }]; },
    sendText: async (jid, text) => { log.sent.push([jid, text]); return 'S' + (++nid); },
    mirror: async m => log.mir.push(m) });
  return { core, log, adv: ms => { clock += ms; }, ts: () => Math.floor(clock / 1000) };
};
const msg = (id, text, extra = {}) => ({ key: { id, remoteJid: '573001234567@s.whatsapp.net', fromMe: false, ...(extra.key || {}) }, message: { conversation: text }, pushName: 'Juan', messageTimestamp: extra.ts, ...extra.top });

{ const x = mk(); await x.core.onMessage(msg('1', 'Hola', { ts: x.ts() }));
  t('cliente escribe: bot responde con 2 mensajes', x.log.sent.length === 2 && x.log.sent[0][0] === '573001234567@s.whatsapp.net');
  t('bot recibe sender = número y nombre', x.log.asked[0].sender === '573001234567' && x.log.asked[0].name === 'Juan');
  t('texto del cliente: lo copia el bot, no el servicio (sin duplicados)', x.log.mir.length === 0);
  await x.core.onMessage(msg('1', 'Hola', { ts: x.ts() })); t('mensaje repetido se ignora', x.log.sent.length === 2);
  await x.core.onMessage(msg('2', 'viejo', { ts: x.ts() - 900 })); t('mensaje viejo se ignora', x.log.asked.length === 1);
  await x.core.onMessage({ key: { id: '3', remoteJid: '1203@g.us' }, message: { conversation: 'x' } }); t('grupos se ignoran', x.log.asked.length === 1);
  // humano escribe desde el celular
  await x.core.onMessage({ key: { id: 'H1', remoteJid: '573001234567@s.whatsapp.net', fromMe: true }, message: { conversation: 'Ya te lo llevamos' }, messageTimestamp: x.ts() });
  t('mensaje del equipo se copia como "h"', x.log.mir.length === 1 && x.log.mir[0].role === 'h');
  await x.core.onMessage(msg('4', 'gracias', { ts: x.ts() })); t('con humano atendiendo, el bot se calla', x.log.asked.length === 1 && x.log.sent.length === 2);
  x.adv(16 * 60e3); await x.core.onMessage(msg('5', 'otra cosa', { ts: x.ts() })); t('pasados 15 min el bot vuelve a responder', x.log.asked.length === 2);
  // eco de lo que envió este mismo servicio
  await x.core.onMessage({ key: { id: 'S1', remoteJid: '573001234567@s.whatsapp.net', fromMe: true }, message: { conversation: 'eco' }, messageTimestamp: x.ts() });
  t('el eco de mensajes del bot no cuenta como humano', !x.log.mir.some(m => m.text === 'eco'));
}
{ const x = mk(); await x.core.onMessage({ key: { id: 'i', remoteJid: '573001234567@s.whatsapp.net' }, message: { imageMessage: {} }, messageTimestamp: x.ts() });
  t('foto: se muestra en el POS pero el bot no responde', x.log.mir[0].text.includes('imagen') && x.log.asked.length === 0 && x.log.sent.length === 0); }
{ const x = mk(); await x.core.sendFromPos('3001234567', 'Tu pedido va en camino');
  t('envío desde POS: 10 dígitos -> +57', x.log.sent[0][0] === '573001234567@s.whatsapp.net');
  t('envío desde POS se copia al panel', x.log.mir[0].role === 'h' && x.log.mir[0].sender === '573001234567');
  await assert.rejects(() => x.core.sendFromPos('12', 'x')); t('número inválido se rechaza', true); }
t('toJid', toJid('300 123 4567') === '573001234567@s.whatsapp.net' && toJid('') === '');
t('senderOf lid sin número', senderOf({ remoteJid: '9988@lid' }) === 'lid:9988');
t('senderOf lid con número alterno', senderOf({ remoteJid: '9988@lid', remoteJidAlt: '573001112222@s.whatsapp.net' }) === '573001112222');
t('textOf extendido', textOf({ extendedTextMessage: { text: 'hey' } }).text === 'hey');
t('misma clave que el bot', chatKey('573001234567').length === 24);
// auth state con Firestore simulado
{ const store = new Map(); const D = id => ({ id, ref: { id }, get: async () => ({ exists: store.has(id), data: () => store.get(id) }) });
  const db = { collection: () => ({ doc: id => ({ ...D(id), set: async v => store.set(id, v), delete: async () => store.delete(id) }), get: async () => ({ docs: [...store.keys()].map(id => ({ ref: { id } })) }) }), batch: () => { const ops = []; return { set: (r, v) => ops.push(() => store.set(r.id, v)), delete: r => ops.push(() => store.delete(r.id)), commit: async () => ops.forEach(f => f()) }; } };
  const a = await useFirestoreAuthState(db); await a.saveCreds();
  await a.state.keys.set({ 'pre-key': { 1: { private: Buffer.from('abc'), public: Buffer.from('def') } } });
  const b = await useFirestoreAuthState(db); const k = await b.state.keys.get('pre-key', ['1']);
  t('sesión guardada y recuperada (Buffers)', Buffer.isBuffer(k['1'].private) && k['1'].private.toString() === 'abc' && b.state.creds.registrationId === a.state.creds.registrationId);
  await b.clear(); t('clear borra todo', store.size === 0); }
console.log(ok + ' pruebas OK');
