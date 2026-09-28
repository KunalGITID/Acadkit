// Imported by the generated service worker (workbox importScripts).
// Handles incoming Web Push messages + notification taps.

// Earlier builds cached every Supabase API response here, and signing
// out never cleared it. Drop that cache as this worker takes over, along
// with the Google Fonts caches from before fonts were bundled.
self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all(
      ["supabase-cache", "google-fonts-css", "google-fonts-files"].map((name) =>
        caches.delete(name)
      )
    )
  );
});
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (_) {
    data = { body: event.data && event.data.text ? event.data.text() : "" };
  }
  const title = data.title || "AcadKit";
  const options = {
    body: data.body || "",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag: data.tag,
    renotify: !!data.tag,
    data: { url: data.url || "/" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        for (const client of clients) {
          if ("focus" in client) {
            client.navigate(url);
            return client.focus();
          }
        }
        return self.clients.openWindow(url);
      })
  );
});
