const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');

initializeApp();
const db = getFirestore();
const TZ = 'America/Bogota';   // zona horaria de tus tareas
const REGION = 'us-central1';  // debe ser la misma región de tu Firestore (o la más cercana)

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

// 1) Alguien te pone una tarea (o te manda un aviso): llega al celular
exports.avisoPush = onDocumentCreated({ document: 'avisos/{id}', region: REGION }, async (e) => {
  const a = e.data.data();
  if (a && a.toUid) await push(a.toUid, String(a.title || 'Aviso'), String(a.body || ''), 'aviso');
});

// 2) Se acaba el tiempo de una tarea: avisa 1 hora y 15 minutos antes
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

exports.recordatorios = onSchedule({ schedule: 'every 5 minutes', timeZone: TZ, region: REGION }, async () => {
  const { date, min } = ahora();
  for (const [lead, msg] of [[60, 'Te queda 1 hora'], [15, 'Quedan 15 minutos']]) {
    const a = min + lead - 9, b = min + lead;
    if (a < 0 || b >= 1440) continue;
    const qs = await db.collection('tasks').where('time', '>=', hh(a)).where('time', '<=', hh(b)).get();
    for (const d of qs.docs) {
      const t = d.data();
      if (!t.uid || (t.createdAt && t.createdAt > date)) continue;
      const log = await db.doc('logs/' + date + '_' + d.id).get();
      if (log.exists && log.data().done) continue;
      const first = await db.doc('sent/' + date + '_' + d.id + '_' + lead).create({ at: Date.now() }).then(() => true, () => false);
      if (!first) continue;
      await push(t.uid, (lead === 15 ? '😟 ' : '⏳ ') + msg, t.title + ' · ' + t12(t.time), d.id);
    }
  }
});
