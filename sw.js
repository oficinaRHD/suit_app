// sw.js
// Service Worker para caching offline y sincronización en segundo plano
// Ubicación: raíz del proyecto /sw.js

const CACHE_NAME = 'suit-v1.1.3';
const OFFLINE_URL = '/offline.html';  // Página de respaldo cuando no hay conexión

// Recursos a cachear durante la instalación (core assets)
const STATIC_CACHE_URLS = [
  '/',
  '/qr-planes/*',
  '/select-role.html',
  '/lobby.html',
  '/home-managers.html',
  '/vouche.html',
  '/histori-vouche.html',
  '/settings.html',
  '/offline.html',
  '/login.html',
  '/signup.html',
  '/db-manager.js',
  '/manifest.json'
  
];

// ========== EVENTOS DEL SERVICE WORKER ==========

// INSTALACIÓN: cachear assets estáticos
self.addEventListener('install', (event) => {
  console.log('[SW] Instalando...');
  
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Cacheando assets estáticos');
      return cache.addAll(STATIC_CACHE_URLS);
    }).then(() => {
      // Forzar que el nuevo SW se active inmediatamente
      return self.skipWaiting();
    })
  );
});

// ACTIVACIÓN: limpiar caches antiguas
self.addEventListener('activate', (event) => {
  console.log('[SW] Activando...');
  
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[SW] Eliminando cache antigua:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      // Tomar control de los clientes abiertos inmediatamente
      return self.clients.claim();
    })
  );
});

// FETCH: estrategia Stale-While-Revalidate para HTML y API
// Estrategia: primero cache, luego red, actualizar cache en segundo plano
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // ========== MANEJAR SOLICITUDES A LA API ==========
  // Las peticiones a API se almacenan en IndexedDB a través del código principal
  // Aquí solo interceptamos para saber si estamos offline
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request).catch(() => {
        // Si falla la red, devolvemos un error controlado
        return new Response(
          JSON.stringify({ 
            error: 'offline', 
            message: 'Sin conexión a internet. Los datos se sincronizarán cuando vuelva la conexión.' 
          }),
          { 
            status: 503, 
            headers: { 'Content-Type': 'application/json' } 
          }
        );
      })
    );
    return;
  }
  
  // ========== MANEJAR SOLICITUDES DE NAVEGACIÓN (HTML) ==========
  // Para páginas HTML, intentamos cache -> red -> offline.html
  if (event.request.mode === 'navigate') {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        // Si tenemos la página en cache, la devolvemos inmediatamente
        if (cachedResponse) {
          // Actualizar el cache en segundo plano con la versión más reciente
          fetch(event.request).then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(event.request, networkResponse.clone());
              });
            }
          }).catch(() => {
            // Silenciar errores de red
          });
          return cachedResponse;
        }
        
        // Si no está en cache, intentamos red
        return fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            // Cachear la respuesta para futuras visitas
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, networkResponse.clone());
            });
          }
          return networkResponse;
        }).catch(() => {
          // Si todo falla, mostrar página offline
          return caches.match(OFFLINE_URL);
        });
      })
    );
    return;
  }
  
  // ========== MANEJAR ASSETS ESTÁTICOS (CSS, JS, IMÁGENES) ==========
  // Estrategia: Cache First (prioritario para rendimiento offline)
  if (
    url.pathname.match(/\.(css|js|png|jpg|jpeg|svg|webp|ico|json)$/) ||
    url.hostname.includes('cdn.tailwindcss.com') ||
    url.hostname.includes('fonts.googleapis.com') ||
    url.hostname.includes('fonts.gstatic.com')
  ) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        
        return fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, networkResponse.clone());
            });
          }
          return networkResponse;
        }).catch(() => {
          // Para imágenes, devolver un placeholder
          if (url.pathname.match(/\.(png|jpg|jpeg|svg|webp)$/)) {
            return caches.match('/icons/placeholder-image.png');
          }
          return new Response('Recurso no disponible offline', { status: 404 });
        });
      })
    );
    return;
  }
  
  // ========== OTROS RECURSOS: Network First ==========
  event.respondWith(
    fetch(event.request).catch(() => {
      return caches.match(event.request);
    })
  );
});

// ========== BACKGROUND SYNC ==========
// Para sincronizar datos en segundo plano cuando vuelva la conexión
self.addEventListener('sync', (event) => {
  console.log('[SW] Evento sync recibido:', event.tag);
  
  if (event.tag === 'sync-vouchers') {
    event.waitUntil(syncVouchers());
  }
});

// Función para sincronizar vales pendientes
async function syncVouchers() {
  console.log('[SW] Sincronizando vales pendientes...');
  
  // Obtener los clientes (ventanas) abiertos
  const clients = await self.clients.matchAll({ type: 'window' });
  
  if (clients.length > 0) {
    // Enviar mensaje a la app para que ejecute la sincronización
    clients.forEach(client => {
      client.postMessage({
        type: 'SYNC_TRIGGER',
        payload: { timestamp: Date.now() }
      });
    });
  }
  
  // También podemos intentar sincronizar directamente vía API
  try {
    // Aquí iría la lógica de sincronización con el backend
    // Por ahora, solo registramos
    console.log('[SW] Sync completado');
  } catch (error) {
    console.error('[SW] Error en sync:', error);
    // Si falla, programar reintento
    await self.registration.sync.register('sync-vouchers');
  }
}

// ========== MANEJO DE NOTIFICACIONES PUSH (para cuando tenga plan premium) ==========
self.addEventListener('push', (event) => {
  console.log('[SW] Notificación push recibida:', event);
  
  let data = { title: 'Suit', body: 'Tienes novedades', icon: '/icons/icon-192.png' };
  
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data.body = event.data.text();
    }
  }
  
  const options = {
    body: data.body,
    icon: data.icon || '/icons/icon-192.png',
    badge: '/icons/icon-96.png',
    vibrate: [200, 100, 200],
    data: {
      url: data.url || '/',
      dateOfArrival: Date.now()
    },
    actions: [
      { action: 'open', title: 'Abrir' },
      { action: 'dismiss', title: 'Ignorar' }
    ]
  };
  
  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Manejar clic en notificaciones
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Click en notificación:', event);
  
  event.notification.close();
  
  const urlToOpen = event.notification.data?.url || '/';
  
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Si ya hay una ventana abierta, la enfocamos
      for (const client of clientList) {
        if (client.url === urlToOpen && 'focus' in client) {
          return client.focus();
        }
      }
      // Si no, abrimos una nueva
      if (self.clients.openWindow) {
        return self.clients.openWindow(urlToOpen);
      }
    })
  );
});
