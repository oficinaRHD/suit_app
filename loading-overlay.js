(function() {
    // Leer atributos data del script actual
    const scripts = document.querySelectorAll('script[src*="loading-overlay.js"]');
    const currentScript = scripts[scripts.length - 1];
    const data = currentScript ? currentScript.dataset : {};

    // Configuración con defaults
    const CONFIG = {
        minDisplayTime: parseInt(data.minTime) || 300,
        message: data.message || 'Cargando...',
        spinnerIcon: data.icon || 'autorenew',
        backdropClass: 'bg-black/40 backdrop-blur-sm',
        cardClass: 'bg-white dark:bg-surface rounded-2xl p-8 flex flex-col items-center gap-4 shadow-2xl border border-outline-variant',
        spinnerClass: 'text-5xl text-primary animate-spin',
        textClass: 'text-on-surface font-medium text-sm'
    };

    // Crear el overlay si no existe
    let overlay = document.getElementById('loading-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'loading-overlay';
        overlay.className = `fixed inset-0 z-50 flex items-center justify-center transition-all duration-300 opacity-0 pointer-events-none ${CONFIG.backdropClass}`;
        overlay.innerHTML = `
            <div class="${CONFIG.cardClass}">
                <span class="material-symbols-outlined ${CONFIG.spinnerClass}" style="font-variation-settings:'FILL' 0, 'wght' 400;">
                    ${CONFIG.spinnerIcon}
                </span>
                <p class="${CONFIG.textClass}">${CONFIG.message}</p>
            </div>
        `;
        document.body.prepend(overlay);
    }

    // Control de tiempo mínimo
    let hideTimeout = null;
    let showTimestamp = 0;

    // Mostrar overlay
    window.showLoading = function() {
        if (overlay.classList.contains('opacity-100')) return;
        showTimestamp = Date.now();
        overlay.classList.remove('opacity-0', 'pointer-events-none');
        overlay.classList.add('opacity-100', 'pointer-events-auto');
        if (hideTimeout) {
            clearTimeout(hideTimeout);
            hideTimeout = null;
        }
    };

    // Ocultar overlay (con tiempo mínimo)
    window.hideLoading = function() {
        const elapsed = Date.now() - showTimestamp;
        const remaining = CONFIG.minDisplayTime - elapsed;
        if (remaining > 0) {
            if (hideTimeout) clearTimeout(hideTimeout);
            hideTimeout = setTimeout(() => {
                overlay.classList.remove('opacity-100', 'pointer-events-auto');
                overlay.classList.add('opacity-0', 'pointer-events-none');
                hideTimeout = null;
            }, remaining);
        } else {
            overlay.classList.remove('opacity-100', 'pointer-events-auto');
            overlay.classList.add('opacity-0', 'pointer-events-none');
        }
    };

    // Ocultar al cargar la página (por si quedó visible)
    window.addEventListener('pageshow', window.hideLoading);
    document.addEventListener('DOMContentLoaded', window.hideLoading);

    // Delegación de eventos: clics en enlaces de navegación móvil
    document.addEventListener('click', function(e) {
        const link = e.target.closest('nav.md\\:hidden a');
        if (link && link.href && !link.href.startsWith('#') && link.target !== '_blank' && !link.href.startsWith('javascript:')) {
            window.showLoading();
        }
    });

    // También para enlaces con atributo data-loading="true"
    document.addEventListener('click', function(e) {
        const link = e.target.closest('a[data-loading="true"]');
        if (link && link.href && !link.href.startsWith('#') && link.target !== '_blank' && !link.href.startsWith('javascript:')) {
            window.showLoading();
        }
    });

    // Exponer configuración por si se necesita
    window.loadingOverlayConfig = CONFIG;
})();