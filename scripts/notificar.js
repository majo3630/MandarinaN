const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');

initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
const db = getFirestore();
const TZ = 'America/Bogota'; // zona horaria de tus tareas

const two = n => String(n).padStart(2, '0');
const hh = m => two(Math.floor(m / 60)) + ':' + two(m % 60);
const t12 = h => { const [H, M] = h.split(':').map(Number); return (H % 12 || 12) + ':' + two(M) + ' ' + (H < 12 ? 'AM' : 'PM'); };
function ahora() {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(new Date()).map(x => [x.type, x.value]));
  return { date: p.year + '-' + p.month + '-' + p.day, min: +p.hour * 60 + +p.minute };
}

// Manda la notificación a todos los celulares de una persona
async function push(uid, title, body, tag) {
  const ref = db.doc('tokens/' + uid);
  const snap = await ref.get();
  const tokens = snap.exists ? (snap.data().tokens || []) : [];
  if (!tokens.length) return;
  const r = await getMessaging().sendEachForMulticast({
    tokens,
    data: { title, body, tag: tag || '' },
    webpush: { headers: { Urgency: 'high' } }
  });
  const bad = tokens.filter((t, i) => !r.responses[i].success &&
    /not-registered|invalid-argument|invalid-registration/.test(r.responses[i].error?.code || ''));
  if (bad.length) await ref.update({ tokens: tokens.filter(t => !bad.includes(t)) });
}

async function avisos() {
  // Avisos y tareas nuevas de los últimos 30 minutos que aún no llegaron al celular
  const qs = await db.collection('avisos').where('at', '>=', Date.now() - 30 * 60 * 1000).get();
  for (const d of qs.docs) {
    const a = d.data();
    if (a.pushed || a.seen || !a.toUid) continue;
    await push(a.toUid, String(a.title || 'Aviso'), String(a.body || ''), 'aviso');
    await d.ref.update({ pushed: true });
  }
}

async function recordatorios() {
  const { date, min } = ahora();
  const fin = Math.min(min + 60, 1439);
  if (min + 1 > fin) return;
  const qs = await db.collection('tasks').where('time', '>=', hh(min + 1)).where('time', '<=', hh(fin)).get();
  for (const d of qs.docs) {
    const t = d.data();
    if (!t.uid || !t.time || (t.createdAt && t.createdAt > date)) continue;
    const [H, M] = t.time.split(':').map(Number);
    const diff = H * 60 + M - min;
    const lead = diff <= 15 ? 15 : 60;
    const log = await db.doc('logs/' + date + '_' + d.id).get();
    if (log.exists && log.data().done) continue;
    const primera = await db.doc('sent/' + date + '_' + d.id + '_' + lead).create({ at: Date.now() }).then(() => true, () => false);
    if (!primera) continue;
    const msg = lead === 15 ? '😟 Quedan menos de 15 minutos' : '⏳ Te queda menos de 1 hora';
    await push(t.uid, msg, t.title + ' · ' + t12(t.time), d.id);
  }
}

(async () => {
  try { await avisos(); } catch (e) { console.error('avisos:', e.message); }
  try { await recordatorios(); } catch (e) { console.error('recordatorios:', e.message); }
  console.log('Listo');
})();
