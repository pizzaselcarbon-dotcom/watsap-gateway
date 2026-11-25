// Lógica de mensajes (sin depender de WhatsApp real, para poder probarla).
import crypto from 'node:crypto';

export const clean = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);
export const chatKey = sender => crypto.createHash('sha1').update(clean(sender, 60)).digest('hex').slice(0, 24);
export const toJid = to => {
  let d = String(to || '').replace(/\D/g, '');
  if (d.length === 10 && d[0] === '3') d = '57' + d;
  return d.length >= 11 ? d + '@s.whatsapp.net' : '';
};
const digitsOf = jid => String(jid || '').split('@')[0].split(':')[0].replace(/\D/g, '');

export function textOf(msg) {
  let m = msg || {};
  m = m.ephemeralMessage?.message || m.viewOnceMessage?.message || m.documentWithCaptionMessage?.message || m;
  const t = m.conversation || m.extendedTextMessage?.text || m.imageMessage?.caption || m.videoMessage?.caption || '';
  if (t) return { text: String(t), media: false };
  if (m.imageMessage) return { text: '📷 [imagen]', media: true };
  if (m.audioMessage) return { text: '🎤 [audio]', media: true };
  if (m.videoMessage) return { text: '🎬 [video]', media: true };
  if (m.documentMessage) return { text: '📎 [archivo]', media: true };
  if (m.stickerMessage) return { text: '[sticker]', media: true };
  if (m.locationMessage) return { text: '📍 [ubicación]', media: true };
  return { text: '', media: true };
}

// Identifica al cliente: número real si WhatsApp lo da; si solo da un ID interno (lid) se usa "lid:ID".
export function senderOf(key) {
  const alt = key.senderPn || key.participantPn || (String(key.remoteJidAlt || '').endsWith('@s.whatsapp.net') ? key.remoteJidAlt : '');
  const jid = String(key.remoteJid || '');
  if (jid.endsWith('@s.whatsapp.net')) return digitsOf(jid);
  if (alt) return digitsOf(alt);
  return 'lid:' + digitsOf(jid);
}

export function makeCore({ askBot, sendText, mirror, sendOnly = false, botOn = () => true, transcribe = null, handoffMin = 15, maxAgeSec = 150, now = () => Date.now(), log = console }) {
  const seen = new Set(), sentIds = new Set(), humanAt = new Map(), queues = new Map();
  const rememberSent = id => { if (id) { sentIds.add(id); if (sentIds.size > 500) sentIds.delete(sentIds.values().next().value); } };
  const once = id => { if (!id) return true; if (seen.has(id)) return false; seen.add(id); if (seen.size > 2000) seen.delete(seen.values().next().value); return true; };
  const enqueue = (k, fn) => { const p = (queues.get(k) || Promise.resolve()).then(fn).catch(e => log.error('cola', e && e.message)); queues.set(k, p); p.finally(() => { if (queues.get(k) === p) queues.delete(k); }); return p; };

  async function onMessage(m) {
    if (sendOnly || !botOn()) return; // bot apagado (solo envío): no lee ni responde mensajes (AutoResponder puede atender)
    const key = m.key || {}, jid = key.remoteJid || '';
    if (!m.message || !jid || jid.endsWith('@g.us') || jid.endsWith('@broadcast') || jid.endsWith('@newsletter') || jid === 'status@broadcast') return;
    const ts = Number(m.messageTimestamp && (m.messageTimestamp.toNumber ? m.messageTimestamp.toNumber() : m.messageTimestamp)) || 0;
    if (ts && now() / 1000 - ts > maxAgeSec) return; // mensajes viejos que llegan al reconectar
    if (!once(key.id)) return;
    const { text: text0, media: media0 } = textOf(m.message);
    if (!text0) return;
    const sender = senderOf(key);
    if (key.fromMe) {
      if (sentIds.has(key.id)) return; // lo envió este mismo servicio
      humanAt.set(jid, now());       // alguien del negocio escribió desde el celular: el bot se calla un rato
      await mirror({ sender, name: '', role: 'h', text: text0 });
      return;
    }
    return enqueue(jid, async () => {
      let text = text0, media = media0;
      if (media && transcribe && m.message.audioMessage) { // nota de voz: se pasa a texto y el bot responde como si lo hubiera escrito
        try { const tr = clean(await transcribe(m), 800); if (tr) { text = '🎤 ' + tr; media = false; } } catch (e) { log.error('audio', e && e.message); }
      }
      if (media) { await mirror({ sender, name: clean(m.pushName, 60), role: 'u', text }); return; } // fotos, audios, etc.: solo se muestran en el POS
      // (los mensajes de texto y las respuestas del bot los copia el propio bot.js al POS)
      const last = humanAt.get(jid) || 0;
      if (handoffMin > 0 && now() - last < handoffMin * 60e3) return; // un humano está atendiendo
      let replies = [];
      try { replies = await askBot({ sender, message: text, name: clean(m.pushName, 60) }); }
      catch (e) { log.error('bot', e && e.message); return; }
      for (const r of replies) {
        const t = String((r && r.message) == null ? '' : r.message).replace(/[\u0000-\u0009\u000b-\u001f]/g, ' ').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, 4000); // conserva los saltos de línea
        if (!t) continue;
        const id = await sendText(jid, t);
        rememberSent(id);
      }
    });
  }

  // Envío desde el POS (mensajes rápidos o escritos a mano)
  async function sendFromPos(to, text) {
    const jid = toJid(to), t = String(text || '').trim().slice(0, 4000);
    if (!jid) throw new Error('número inválido');
    if (!t) throw new Error('mensaje vacío');
    const id = await sendText(jid, t, { quick: true });
    rememberSent(id);
    humanAt.set(jid, now());
    if (!sendOnly && botOn()) await mirror({ sender: digitsOf(jid), name: '', role: 'h', text: t });
    return id;
  }
  return { onMessage, sendFromPos, _humanAt: humanAt };
}
