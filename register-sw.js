// register-sw.js
// Registro del Service Worker con manejo de actualizaciones
// Este archivo debe ser incluido en todas las páginas HTML

class ServiceWorkerManager {
  constructor() {
    this.swRegistration = null;
    this.isSupported = 'serviceWorker' in navigator;
    this.isOnline = navigator.onLine;
  }
  
  async init() {
    if (!this.isSupported) {
      console.warn('Service Workers no soportados en este navegador');
      return false;
    }
    
    // Detectar si estamos en iOS (soporte limitado para PWA)
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    if (isIOS) {
      console.log('iOS detectado - algunas características offline pueden ser limitadas');
    }
    
    try {
      // Registrar el Service Worker
      this.swRegistration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/'
      });
      
      console.log('[SW] Service Worker registrado con scope:', this.swRegistration.scope);
      
      // Manejar actualizaciones
      this.swRegistration.addEventListener('updatefound', () => {
        const newWorker = this.swRegistration.installing;
        console.log('[SW] Nueva versión del Service Worker encontrada');
        
        newWorker.addEventListener('statechange', () => {
          console.log('[SW] Estado del worker:', newWorker.state);
          
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            // Hay una nueva versión disponible, notificar al usuario
            this.showUpdateNotification();
          }
        });
      });
      
      // Escuchar mensajes del Service Worker
      navigator.serviceWorker.addEventListener('message', this.handleSWMessage.bind(this));
      
      // Registrar Background Sync si está disponible
      await this.registerBackgroundSync();
      
      // Registrar Push Notifications si el usuario tiene plan premium
      await this.registerPushNotifications();
      
      return true;
      
    } catch (error) {
      console.error('[SW] Error registrando Service Worker:', error);
      return false;
    }
  }
  
  // Manejar mensajes del Service Worker
  handleSWMessage(event) {
    console.log('[SW] Mensaje recibido del Service Worker:', event.data);
    
    switch (event.data.type) {
      case 'SYNC_TRIGGER':
        // Disparar evento personalizado para que la app maneje la sincronización
        window.dispatchEvent(new CustomEvent('sw-sync-trigger', {
          detail: event.data.payload
        }));
        break;
        
      default:
        console.log('[SW] Mensaje no manejado:', event.data.type);
    }
  }
  
  // Registrar Background Sync (para sincronización offline)
  async registerBackgroundSync() {
    if (!this.swRegistration || !this.swRegistration.sync) {
      console.log('[SW] Background Sync no soportado');
      return false;
    }
    
    try {
      // Registrar sync para vales pendientes
      await this.swRegistration.sync.register('sync-vouchers');
      console.log('[SW] Background Sync registrado correctamente');
      return true;
    } catch (error) {
      console.error('[SW] Error registrando Background Sync:', error);
      return false;
    }
  }
  
  // Registrar Push Notifications (requiere plan premium)
  async registerPushNotifications() {
    if (!this.swRegistration || !this.swRegistration.pushManager) {
      console.log('[SW] Push Notifications no soportadas');
      return false;
    }
    
    // Verificar si el usuario tiene plan premium
    // Esta información vendrá de IndexedDB
    
    // Por ahora, no solicitamos permisos automáticamente
    return false;
  }
  
  // Solicitar suscripción a Push Notifications (solo para usuarios premium)
  async subscribeToPush() {
    if (!this.swRegistration || !this.swRegistration.pushManager) {
      return null;
    }
    
    try {
      const subscription = await this.swRegistration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: this.urlBase64ToUint8Array('TU_VAPID_PUBLIC_KEY')
      });
      
      console.log('[SW] Suscripción a Push obtenida:', subscription);
      
      // Enviar suscripción al servidor
      // await fetch('/api/push/subscribe', { method: 'POST', body: JSON.stringify(subscription) });
      
      return subscription;
      
    } catch (error) {
      console.error('[SW] Error suscribiéndose a Push:', error);
      return null;
    }
  }
  
  // Utilidad para convertir VAPID key
  urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }
  
  // Notificar al usuario que hay una actualización disponible
  showUpdateNotification() {
    // Crear un toast o banner no intrusivo
    const updateBanner = document.createElement('div');
    updateBanner.className = 'fixed bottom-20 left-4 right-4 md:left-auto md:right-4 md:bottom-4 md:w-80 bg-primary text-on-primary p-4 rounded-xl shadow-lg z-50 animate-in slide-in-from-bottom-4';
    updateBanner.innerHTML = `
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <span class="material-symbols-outlined">system_update</span>
          <div>
            <p class="font-bold text-sm">Actualización disponible</p>
            <p class="text-xs opacity-90">Nueva versión lista para instalar</p>
          </div>
        </div>
        <button id="update-app-btn" class="px-3 py-1 bg-white text-primary rounded-lg text-sm font-bold">Actualizar</button>
      </div>
    `;
    
    document.body.appendChild(updateBanner);
    
    document.getElementById('update-app-btn')?.addEventListener('click', () => {
      updateBanner.remove();
      window.location.reload();
    });
    
    // Auto-remover después de 10 segundos si no se interactúa
    setTimeout(() => {
      if (updateBanner.parentNode) updateBanner.remove();
    }, 10000);
  }
  
  // Verificar si hay actualizaciones del Service Worker
  async checkForUpdates() {
    if (!this.swRegistration) return;
    
    try {
      await this.swRegistration.update();
      console.log('[SW] Verificación de actualizaciones completada');
    } catch (error) {
      console.error('[SW] Error verificando actualizaciones:', error);
    }
  }
}

// Inicializar el gestor de Service Worker cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
  window.swManager = new ServiceWorkerManager();
  window.swManager.init();
  
  // Verificar actualizaciones cada hora
  setInterval(() => {
    if (window.swManager) {
      window.swManager.checkForUpdates();
    }
  }, 60 * 60 * 1000);
});