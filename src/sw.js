// This is the service worker file for the Event Scheduler web app.
// It is responsible for caching the app shell and handling background sync tasks.
// Cache the app shell

const CACHE_NAME = `cache-v${__BUILD_DATE__}`;
const ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/script.js',
  '/dist/bundle.js',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;600&display=swap'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll([
        '/',
        new Request('index.html', { cache: 'reload' }),
        'style.css',
        'script.js'
      ]).catch(console.error))
  );
});


self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName.startsWith('event-scheduler-') && cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        return response || fetch(event.request)
          .then(fetchResponse => {
            return caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request.url, fetchResponse.clone());
              return fetchResponse;
            });
          });
      }).catch(() => {
        return caches.match('/index.html');
      })
  );
});

// Handle background sync tasks
self.addEventListener('sync', (event) => {
    if (event.tag === 'pending-tasks') {
        event.waitUntil(handlePendingTasks());
    }
});

async function handlePendingTasks() {
    const clients = await self.clients.matchAll();
    clients.forEach(client => client.postMessage({ type: 'SYNC_PENDING_TASKS' }));
}

self.addEventListener('message', (event) => {
    if (event.data.type === 'SYNC_PENDING_TASKS') {
        event.waitUntil(processPendingTasks());
    }
});

// Process pending tasks
async function processPendingTasks() {
    const db = await indexedDB.open('EventSchedulerDB');
    const transaction = db.transaction(['pendingTasks'], 'readwrite');
    const store = transaction.objectStore('pendingTasks');
    const tasks = await store.getAll();

    for (const task of tasks) {
        try {
            if (task.action === 'add') {
                await firebase.firestore().collection('events').add(task.data);
            } else if (task.action === 'delete') {
                await firebase.firestore().collection('events').doc(task.data.id).delete();
            }
            await store.delete(task.id);
        } catch (error) {
            console.error('Sync failed:', error);
        }
    }
}