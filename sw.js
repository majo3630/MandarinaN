importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js','https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');
firebase.initializeApp({
  apiKey:"AIzaSyChBfufHiwa6cDOjIkDv66rtoimcixPefs",
  authDomain:"mandarinanotas.firebaseapp.com",
  projectId:"mandarinanotas",
  storageBucket:"mandarinanotas.firebasestorage.app",
  messagingSenderId:"578281064114",
  appId:"1:578281064114:web:1aeba7ebc224224da26bab"
});
const messaging=firebase.messaging();
// Llega un aviso con la app cerrada o en segundo plano
messaging.onBackgroundMessage(p=>{
  const d=p.data||{};
  self.registration.showNotification(d.title||'Tareas de Otoño',{body:d.body||'',icon:'icon-192.png',tag:d.tag||undefined,renotify:!!d.tag});
});
self.addEventListener('notificationclick',e=>{
  e.notification.close();
  e.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(l=>l.length?l[0].focus():clients.openWindow('./')));
});
// Copia sencilla para que la app abra aunque no haya internet
const C='otono-v1';
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',e=>e.waitUntil(clients.claim()));
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  e.respondWith(fetch(e.request).then(r=>{
    if(r.ok&&new URL(e.request.url).origin===location.origin){const c=r.clone();caches.open(C).then(x=>x.put(e.request,c))}
    return r;
  }).catch(()=>caches.match(e.request)));
});
