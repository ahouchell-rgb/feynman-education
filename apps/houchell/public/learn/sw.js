// Houchell KS3 Science — offline service worker.
// Cache-first for the app shell (so it works offline + installs as a PWA),
// and runtime-cache other GETs (e.g. Google Fonts) as they're fetched.
// v4: precache the newly-extracted content.js (item C8) + add streak-reminder
//     notification handlers (item C9). Bumping CACHE evicts the old v3 shell.
// v5: interactive diagram checkpoints, guided→exam-conditions ladder, and the
//     first KS3-core exam questions — bump to evict the stale v4 shell.
// v16: Duolingo-style loop — mistake recycling, feedback sounds/haptics, in-lesson
//      combo bonus, "Jump back in" hero, daily-goal chip, completion celebrations.
// v17: Learn-experience refocus — check-as-you-learn quick checks after each fact,
//      key words bolded in the teaching sentence, "what you'll learn" mission card,
//      + 123 new teaching facts closing quizzed-but-untaught gaps (content.js).
// v18: precache with cache:"reload" so a content.js update is never missed.
// v19: +35 new GCSE teaching facts (Physics/Chemistry/Biology) closing the remaining
//      quizzed-but-untaught gaps across all GCSE units (content.js).
const CACHE = "feynman-sci-v19";
const SHELL = [
  "springboard.html",
  "content.js",
  "magnetism-intro-interactive.html",
  "manifest.webmanifest",
  "icon-192.png",
  "icon-512.png"
];

self.addEventListener("install", (e) => {
  // Precache with cache:"reload" so a fresh CACHE version always re-fetches the shell
  // (esp. content.js, whose filename never changes) from the network, never from the
  // browser's own HTTP cache — otherwise a content update could be silently missed.
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: "reload" }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  e.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => { try { c.put(req, copy); } catch (_) {} });
        return res;
      }).catch(() => caches.match("springboard.html"));
    })
  );
});

// ---- Streak reminders (item C9) ----------------------------------------------
// LOCAL ONLY: there is no push server and no Web Push subscription here. The page
// drives reminders directly (reg.showNotification when it's open), and where the
// browser supports Periodic Background Sync the SW can also wake ~daily to remind
// even when the app is closed. A true closed-app guarantee would need a real push
// server, which is intentionally out of scope.

const REMINDER_TITLE = "Houchell · KS3 Science";

// Periodic Background Sync (Chromium-only, best-effort — the browser decides if/when
// it fires). The SW cannot read localStorage, so the open page is the source of truth
// for the streak count; if a page is open it has already fired its own foreground
// reminder, so the SW only shows the generic nudge in the closed-app case.
self.addEventListener("periodicsync", (e) => {
  if (e.tag === "streak-reminder") {
    e.waitUntil(showStreakReminder());
  }
});

async function showStreakReminder() {
  try {
    const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    if (clients.length > 0) return; // page is open and handles its own reminder
  } catch (_) {}
  return self.registration.showNotification(REMINDER_TITLE, {
    body: "🔥 Keep your streak alive — 2 minutes of science?",
    tag: "streak-reminder",
    renotify: true,
    icon: "icon-192.png",
    badge: "icon-192.png",
    data: { url: "springboard.html" }
  });
}

// Clicking the notification focuses an open tab or opens the learn app.
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const target = (e.notification.data && e.notification.data.url) || "springboard.html";
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const c of clients) {
        if (c.url.includes("springboard.html") && "focus" in c) return c.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(target);
    })
  );
});
