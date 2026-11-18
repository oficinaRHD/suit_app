// install-pwa.js
// Maneja la instalación de la PWA y muestra el banner "Instalar App"

class PWAInstallManager {
    constructor() {
        this.deferredPrompt = null;
        this.isInstalled = false;
        this.installButton = null;
    }
    
    init() {
        // Detectar si la app ya está instalada
        this.checkIfInstalled();
        
        // Escuchar evento beforeinstallprompt
        window.addEventListener('beforeinstallprompt', (e) => {
            console.log('[PWA] beforeinstallprompt disparado');
            
            // Prevenir que Chrome muestre el diálogo automático
            e.preventDefault();
            
            // Guardar el evento para usarlo después
            this.deferredPrompt = e;
            
            // Mostrar el botón de instalación personalizado
            this.showInstallButton();
        });
        
        // Escuchar evento de instalación completada
        window.addEventListener('appinstalled', (event) => {
            console.log('[PWA] App instalada correctamente');
            this.isInstalled = true;
            this.hideInstallButton();
            
            // Registrar analytics
            if (window.gtag) {
                window.gtag('event', 'pwa_installed');
            }
        });
    }
    
    checkIfInstalled() {
        // Verificar si la app está en modo standalone (instalada)
        if (window.matchMedia('(display-mode: standalone)').matches) {
            this.isInstalled = true;
            console.log('[PWA] App ejecutándose en modo standalone (instalada)');
        }
        
        // Escuchar cambios en display-mode
        window.matchMedia('(display-mode: standalone)').addEventListener('change', (evt) => {
            if (evt.matches) {
                this.isInstalled = true;
                this.hideInstallButton();
            }
        });
    }
    
    showInstallButton() {
        // Evitar mostrar si ya está instalada
        if (this.isInstalled) return;
        
        // Evitar mostrar múltiples veces
        if (document.getElementById('pwa-install-banner')) return;
        
        // Crear banner de instalación
        const banner = document.createElement('div');
        banner.id = 'pwa-install-banner';
        banner.className = 'fixed bottom-20 left-4 right-4 md:left-auto md:right-4 md:bottom-4 md:w-96 bg-surface-container-lowest border border-outline-variant rounded-xl shadow-xl z-50 animate-in slide-in-from-bottom-4';
        banner.innerHTML = `
            <div class="p-4">
                <div class="flex items-start gap-3">
                    <div class="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <span class="material-symbols-outlined text-primary">install_mobile</span>
                    </div>
                    <div class="flex-1">
                        <h4 class="font-title-sm text-title-sm text-on-surface">Instalar Suit</h4>
                        <p class="text-body-sm text-on-surface-variant mt-1">
                            Instala la aplicación para trabajar sin conexión y acceder más rápido.
                        </p>
                        <div class="flex gap-3 mt-3">
                            <button id="install-pwa-btn" class="px-4 py-2 bg-primary text-on-primary rounded-lg font-label-bold text-label-bold">
                                Instalar
                            </button>
                            <button id="dismiss-pwa-btn" class="px-4 py-2 border border-outline text-on-surface-variant rounded-lg font-label-bold text-label-bold">
                                Ahora no
                            </button>
                        </div>
                    </div>
                    <button id="close-pwa-banner" class="p-1 text-on-surface-variant hover:text-primary">
                        <span class="material-symbols-outlined text-sm">close</span>
                    </button>
                </div>
            </div>
        `;
        
        document.body.appendChild(banner);
        
        // Eventos del banner
        document.getElementById('install-pwa-btn')?.addEventListener('click', () => {
            this.installApp();
        });
        
        document.getElementById('dismiss-pwa-btn')?.addEventListener('click', () => {
            this.dismissInstall();
        });
        
        document.getElementById('close-pwa-banner')?.addEventListener('click', () => {
            this.dismissInstall();
        });
        
        // Guardar en localStorage que el usuario rechazó la instalación
        const dismissed = localStorage.getItem('pwa-install-dismissed');
        const dismissedTime = localStorage.getItem('pwa-install-dismissed-time');
        
        if (dismissed === 'true' && dismissedTime && (Date.now() - parseInt(dismissedTime)) < 7 * 24 * 60 * 60 * 1000) {
            banner.style.display = 'none';
        }
    }
    
    async installApp() {
        if (!this.deferredPrompt) {
            console.log('[PWA] No hay evento de instalación pendiente');
            return;
        }
        
        // Mostrar el diálogo de instalación nativo
        this.deferredPrompt.prompt();
        
        // Esperar la respuesta del usuario
        const choiceResult = await this.deferredPrompt.userChoice;
        
        if (choiceResult.outcome === 'accepted') {
            console.log('[PWA] Usuario aceptó la instalación');
            this.isInstalled = true;
            this.hideInstallButton();
        } else {
            console.log('[PWA] Usuario rechazó la instalación');
            this.dismissInstall();
        }
        
        // Limpiar el evento ya que solo se puede usar una vez
        this.deferredPrompt = null;
    }
    
    dismissInstall() {
        this.hideInstallButton();
        // Guardar que el usuario rechazó (por 7 días)
        localStorage.setItem('pwa-install-dismissed', 'true');
        localStorage.setItem('pwa-install-dismissed-time', Date.now().toString());
    }
    
    hideInstallButton() {
        const banner = document.getElementById('pwa-install-banner');
        if (banner) {
            banner.remove();
        }
    }
}

// Inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    window.pwaManager = new PWAInstallManager();
    window.pwaManager.init();
});