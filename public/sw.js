/**
 * The push half of mozg's notifications. Registered only when the operator
 * enables notifications in /admin — a visitor's browser never sees this.
 */
self.addEventListener("push", (event) => {
  let data = { title: "mozg", body: "", url: "/admin" };
  try {
    data = { ...data, ...event.data.json() };
  } catch {
    /* a push with no JSON still shows something */
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/brand/mascot.webp",
      badge: "/brand/mascot.webp",
      data: { url: data.url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/admin";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (c.url.includes(url) && "focus" in c) return c.focus();
      }
      return clients.openWindow(url);
    }),
  );
});
