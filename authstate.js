// Guarda la sesión de WhatsApp en Firestore (colección "wa_auth"), así no se pierde si el servidor se reinicia.
import { BufferJSON, initAuthCreds, proto } from '@whiskeysockets/baileys';

export async function useFirestoreAuthState(db, col = 'wa_auth') {
  const C = db.collection(col);
  const enc = v => JSON.stringify(v, BufferJSON.replacer);
  const dec = s => JSON.parse(s, BufferJSON.reviver);
  const did = (t, i) => (t + '__' + String(i)).replace(/[\/\\]/g, '_').replace(/^\.+$/, '_');
  const cd = await C.doc('creds').get();
  const creds = cd.exists ? dec(cd.data().v) : initAuthCreds();
  const keys = {
    get: async (type, ids) => {
      const out = {};
      await Promise.all(ids.map(async i => {
        const d = await C.doc(did(type, i)).get();
        if (!d.exists) return;
        let v = dec(d.data().v);
        if (type === 'app-state-sync-key' && v) v = proto.Message.AppStateSyncKeyData.fromObject(v);
        out[i] = v;
      }));
      return out;
    },
    set: async data => {
      const ops = [];
      for (const type of Object.keys(data)) for (const i of Object.keys(data[type])) ops.push([C.doc(did(type, i)), data[type][i]]);
      for (let n = 0; n < ops.length; n += 400) {
        const b = db.batch();
        ops.slice(n, n + 400).forEach(([ref, v]) => (v ? b.set(ref, { v: enc(v) }) : b.delete(ref)));
        await b.commit();
      }
    }
  };
  return {
    state: { creds, keys },
    saveCreds: () => C.doc('creds').set({ v: enc(creds) }),
    clear: async () => { const s = await C.get(); for (let n = 0; n < s.docs.length; n += 400) { const b = db.batch(); s.docs.slice(n, n + 400).forEach(d => b.delete(d.ref)); await b.commit(); } }
  };
}
