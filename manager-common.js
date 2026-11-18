// manager-common.js
// Funciones comunes para todas las vistas del gestor (offline-first)

// ========== ESTADO GLOBAL ==========
let db = null;
let isOnline = navigator.onLine;
let currentUserPlan = 'free'; // 'free' o 'premium'

// ========== INICIALIZACIÓN ==========
async function initManagerViews() {
    console.log('[Manager] Inicializando vista offline-first...');
    
    // Mostrar indicador de carga
    showLoadingOverlay();
    
    try {
        // Inicializar base de datos
        if (!window.suitDB) {
            console.error('[Manager] DB Manager no disponible');
            return;
        }
        
        db = window.suitDB;
        await db.init();
        await db.loadInitialData();
        
        // Obtener plan del usuario
        currentUserPlan = await db.getSetting('userPlan', 'free');
        
        // Actualizar UI según conectividad
        updateConnectivityUI();
        
        // Escuchar eventos de conectividad
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        window.addEventListener('connectivity-change', (e) => {
            isOnline = e.detail.isOnline;
            updateConnectivityUI();
        });
        
        // Escuchar evento de sincronización desde Service Worker
        window.addEventListener('sw-sync-trigger', () => {
            console.log('[Manager] Sync trigger recibido, procesando...');
            processSync();
        });
        
        // Cargar datos específicos según la página
        await loadPageData();
        
    } catch (error) {
        console.error('[Manager] Error en inicialización:', error);
        showToast('Error al cargar datos locales', 'error');
    } finally {
        hideLoadingOverlay();
    }
}

// ========== MANEJO DE CONECTIVIDAD ==========
function updateConnectivityUI() {
    const syncStatusElements = document.querySelectorAll('.sync-status, .estado-sincronizacion');
    const onlineBadges = document.querySelectorAll('.online-badge');
    const offlineBadges = document.querySelectorAll('.offline-badge');
    
    if (isOnline) {
        syncStatusElements.forEach(el => {
            el.innerHTML = '<span class="material-symbols-outlined text-green-500 text-sm">cloud_done</span> <span class="text-xs">Sincronizado</span>';
        });
        onlineBadges.forEach(el => el.classList.remove('hidden'));
        offlineBadges.forEach(el => el.classList.add('hidden'));
        
        // Si estamos online, intentar sincronizar
        processSync();
    } else {
        syncStatusElements.forEach(el => {
            el.innerHTML = '<span class="material-symbols-outlined text-amber-500 text-sm">cloud_off</span> <span class="text-xs">Trabajando offline</span>';
        });
        onlineBadges.forEach(el => el.classList.add('hidden'));
        offlineBadges.forEach(el => el.classList.remove('hidden'));
        
        showToast('Modo offline activado. Los datos se guardarán localmente.', 'info', 3000);
    }
}

function handleOnline() {
    isOnline = true;
    updateConnectivityUI();
    showToast('Conexión restablecida. Sincronizando datos...', 'success', 3000);
    processSync();
}

function handleOffline() {
    isOnline = false;
    updateConnectivityUI();
    showToast('Sin conexión. Trabajando en modo offline.', 'warning', 3000);
}

// ========== SINCRONIZACIÓN ==========
async function processSync() {
    if (!isOnline) return;
    
    console.log('[Manager] Procesando cola de sincronización...');
    
    try {
        const pendingOps = await db.getPendingSyncOperations();
        
        if (pendingOps.length === 0) {
            console.log('[Manager] No hay operaciones pendientes');
            return;
        }
        
        showToast(`Sincronizando ${pendingOps.length} elementos...`, 'info', 2000);
        
        for (const op of pendingOps) {
            try {
                // Simular envío a API (reemplazar con endpoints reales)
                // const response = await fetch('/api/sync', {
                //     method: 'POST',
                //     headers: { 'Content-Type': 'application/json' },
                //     body: JSON.stringify(op)
                // });
                // if (response.ok) {
                //     await db.markSyncOperationComplete(op.operationId);
                //     if (op.store === 'vouchers') {
                //         await db.updateVoucher(op.recordId, { syncStatus: 'synced' });
                //     }
                // }
                
                // Simulación de éxito
                await new Promise(resolve => setTimeout(resolve, 500));
                await db.markSyncOperationComplete(op.operationId);
                if (op.store === 'vouchers') {
                    await db.updateVoucher(op.recordId, { syncStatus: 'synced' });
                }
                
            } catch (error) {
                console.error(`[Manager] Error sincronizando operación ${op.operationId}:`, error);
                await db.markSyncOperationFailed(op.operationId);
            }
        }
        
        showToast('Sincronización completada', 'success', 2000);
        
        // Recargar datos de la página actual
        await loadPageData();
        
    } catch (error) {
        console.error('[Manager] Error en proceso de sincronización:', error);
    }
}

// ========== UTILIDADES UI ==========
function showLoadingOverlay() {
    let overlay = document.getElementById('loading-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'loading-overlay';
        overlay.className = 'fixed inset-0 bg-black/50 z-[100] flex items-center justify-center';
        overlay.innerHTML = `
            <div class="bg-surface rounded-xl p-6 flex flex-col items-center gap-4 shadow-2xl">
                <div class="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                <p class="text-on-surface font-medium">Cargando datos...</p>
            </div>
        `;
        document.body.appendChild(overlay);
    }
    overlay.classList.remove('hidden');
}

function hideLoadingOverlay() {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) overlay.classList.add('hidden');
}

function showToast(message, type = 'info', duration = 3000) {
    // Eliminar toast existente
    const existingToast = document.getElementById('dynamic-toast');
    if (existingToast) existingToast.remove();
    
    // Colores según tipo
    const colors = {
        success: 'bg-green-500',
        error: 'bg-error',
        warning: 'bg-amber-500',
        info: 'bg-primary'
    };
    
    const icons = {
        success: 'check_circle',
        error: 'error',
        warning: 'warning',
        info: 'info'
    };
    
    const toast = document.createElement('div');
    toast.id = 'dynamic-toast';
    toast.className = `fixed bottom-24 left-4 right-4 md:left-auto md:right-4 md:bottom-24 md:w-auto ${colors[type]} text-white px-4 py-3 rounded-xl shadow-lg z-50 flex items-center gap-3 animate-in slide-in-from-bottom-4`;
    toast.innerHTML = `
        <span class="material-symbols-outlined">${icons[type]}</span>
        <span class="text-sm font-medium">${message}</span>
    `;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.classList.add('animate-out', 'fade-out', 'slide-out-to-bottom');
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

// ========== FUNCIONES ESPECÍFICAS PARA CADA VISTA ==========

// Para home-managers.html - Cargar métricas del dashboard
async function loadDashboardMetrics() {
    const metrics = await db.getDashboardMetrics();
    
    // Actualizar elementos del dashboard con IDs específicos
    const totalVouchersEl = document.getElementById('total-vouchers');
    const pendingVouchersEl = document.getElementById('pending-vouchers');
    const pendingCommissionEl = document.getElementById('pending-commission');
    const weeklyVolumeEl = document.getElementById('weekly-volume');
    
    if (totalVouchersEl) totalVouchersEl.textContent = metrics.totalVouchers;
    if (pendingVouchersEl) pendingVouchersEl.textContent = metrics.pendingVouchers;
    if (pendingCommissionEl) pendingCommissionEl.textContent = `$${metrics.totalPendingCommission.toLocaleString()}`;
    if (weeklyVolumeEl) weeklyVolumeEl.textContent = `$${metrics.weeklyVolume.toLocaleString()}`;
}

// Para histori-vouche.html - Cargar lista de vales
async function loadVouchersList() {
    const vouchers = await db.getAllVouchers();
    // Ordenar por fecha descendente
    vouchers.sort((a, b) => b.createdAt - a.createdAt);
    
    // Actualizar tabla desktop y cards mobile
    renderVouchersTable(vouchers);
    renderVouchersCards(vouchers);
    
    // Actualizar contadores de la barra de filtros
    updateFilterCounters(vouchers);
}

function renderVouchersTable(vouchers) {
    const tbody = document.querySelector('#vouchers-table-body');
    if (!tbody) return;
    
    if (vouchers.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="px-6 py-12 text-center text-on-surface-variant">
                    <span class="material-symbols-outlined text-4xl mb-2">receipt_long</span>
                    <p>No hay vales registrados</p>
                    <a href="vouche.html" class="text-primary text-sm mt-2 inline-block">Crear primer vale →</a>
                </td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = vouchers.map(voucher => `
        <tr class="hover:bg-surface-container transition-colors group cursor-pointer" onclick="openVoucherDetail('${voucher.id}')">
            <td class="px-6 py-4">
                <p class="font-data-mono text-data-mono text-on-surface">${formatDate(voucher.createdAt)}</p>
                <p class="text-[11px] text-on-surface-variant">${formatTime(voucher.createdAt)}</p>
            </td>
            <td class="px-6 py-4">
                <span class="font-label-bold text-label-bold text-primary">${voucher.voucherNumber || 'VCH-' + voucher.id.slice(-6)}</span>
            </td>
            <td class="px-6 py-4">
                <div class="flex items-center gap-3">
                    <div class="h-8 w-8 rounded bg-secondary-fixed text-on-secondary-fixed flex items-center justify-center font-bold text-xs">
                        ${getInitials(voucher.client?.name || '?')}
                    </div>
                    <div>
                        <p class="font-body-sm text-body-sm text-on-surface">${voucher.client?.name || 'Cliente sin nombre'}</p>
                        <p class="text-[11px] text-on-surface-variant">${voucher.client?.phone || ''}</p>
                    </div>
                </div>
            </td>
            <td class="px-6 py-4">
                <p class="font-body-sm text-body-sm">${voucher.product?.name || 'Producto no especificado'}</p>
            </td>
            <td class="px-6 py-4">
                <p class="font-data-mono text-data-mono text-on-surface font-bold">$${voucher.totalAmount?.toLocaleString() || '0'}</p>
            </td>
            <td class="px-6 py-4 text-center">
                ${getStatusBadge(voucher.status, voucher.syncStatus)}
            </td>
            <td class="px-6 py-4 text-right">
                <div class="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button class="p-1.5 hover:bg-surface-container-highest rounded text-on-surface-variant" onclick="event.stopPropagation(); openVoucherDetail('${voucher.id}')">
                        <span class="material-symbols-outlined text-[20px]">visibility</span>
                    </button>
                    ${voucher.syncStatus === 'pending' ? `
                        <button class="p-1.5 hover:bg-surface-container-highest rounded text-amber-500" onclick="event.stopPropagation(); retrySync('${voucher.id}')">
                            <span class="material-symbols-outlined text-[20px]">sync</span>
                        </button>
                    ` : ''}
                </div>
            </td>
        </tr>
    `).join('');
}

function renderVouchersCards(vouchers) {
    const container = document.querySelector('#vouchers-cards-container');
    if (!container) return;
    
    if (vouchers.length === 0) {
        container.innerHTML = `
            <div class="p-8 text-center text-on-surface-variant">
                <span class="material-symbols-outlined text-4xl mb-2">receipt_long</span>
                <p>No hay vales registrados</p>
                <a href="vouche.html" class="text-primary text-sm mt-2 inline-block">Crear primer vale →</a>
            </div>
        `;
        return;
    }
    
    container.innerHTML = vouchers.slice(0, 10).map(voucher => `
        <div class="p-4 space-y-3 active:bg-surface-container transition-colors cursor-pointer" onclick="openVoucherDetail('${voucher.id}')">
            <div class="flex justify-between items-start">
                <span class="font-label-bold text-label-bold text-primary">${voucher.voucherNumber || 'VCH-' + voucher.id.slice(-6)}</span>
                ${getStatusBadgeMobile(voucher.status, voucher.syncStatus)}
            </div>
            <div class="flex items-center gap-3">
                <div class="h-10 w-10 rounded bg-secondary-fixed text-on-secondary-fixed flex items-center justify-center font-bold">
                    ${getInitials(voucher.client?.name || '?')}
                </div>
                <div>
                    <p class="font-title-sm text-sm">${voucher.client?.name || 'Cliente sin nombre'}</p>
                    <p class="text-xs text-on-surface-variant">${voucher.product?.name || 'Producto no especificado'}</p>
                </div>
            </div>
            <div class="flex justify-between items-center pt-2">
                <div class="text-[11px] text-on-surface-variant">
                    ${formatDate(voucher.createdAt)} • ${formatTime(voucher.createdAt)}
                </div>
                <p class="font-data-mono font-bold text-on-surface">$${voucher.totalAmount?.toLocaleString() || '0'}</p>
            </div>
            ${voucher.syncStatus === 'pending' ? `
                <div class="flex justify-end">
                    <button class="text-xs text-amber-500 flex items-center gap-1" onclick="event.stopPropagation(); retrySync('${voucher.id}')">
                        <span class="material-symbols-outlined text-sm">sync</span>
                        Pendiente de sincronizar
                    </button>
                </div>
            ` : ''}
        </div>
    `).join('');
}

function updateFilterCounters(vouchers) {
    const total = vouchers.length;
    const pending = vouchers.filter(v => v.status === 'pending' || v.status === 'sent').length;
    const accepted = vouchers.filter(v => v.status === 'approved' || v.status === 'synced').length;
    
    const totalBadge = document.querySelector('.filter-total-badge');
    const pendingBadge = document.querySelector('.filter-pending-badge');
    const acceptedBadge = document.querySelector('.filter-accepted-badge');
    
    if (totalBadge) totalBadge.textContent = total;
    if (pendingBadge) pendingBadge.textContent = pending;
    if (acceptedBadge) acceptedBadge.textContent = accepted;
}

// ========== FUNCIONES AUXILIARES ==========
function formatDate(timestamp) {
    if (!timestamp) return 'Fecha no disponible';
    const date = new Date(timestamp);
    return date.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatTime(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

function getInitials(name) {
    if (!name) return '?';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

function getStatusBadge(status, syncStatus) {
    const statusMap = {
        'pending': { text: 'Pendiente', class: 'bg-secondary-container text-on-secondary-container' },
        'sent': { text: 'Enviado al Proveedor', class: 'bg-primary-container/10 text-primary-container' },
        'approved': { text: 'Aprobado', class: 'bg-green-100 text-green-700' },
        'rejected': { text: 'Rechazado', class: 'bg-error-container text-error' },
        'synced': { text: 'Completado', class: 'bg-green-100 text-green-700' }
    };
    
    const config = statusMap[status] || statusMap['pending'];
    
    if (syncStatus === 'pending') {
        return `<span class="px-3 py-1 rounded-full text-[11px] font-bold uppercase bg-amber-100 text-amber-700 flex items-center gap-1">
            <span class="w-1.5 h-1.5 rounded-full bg-amber-700"></span>
            Pendiente de sincronizar
        </span>`;
    }
    
    return `<span class="px-3 py-1 rounded-full text-[11px] font-bold uppercase ${config.class}">
        ${config.text}
    </span>`;
}

function getStatusBadgeMobile(status, syncStatus) {
    const statusMap = {
        'pending': 'bg-secondary-container text-on-secondary-container',
        'sent': 'bg-primary-container/10 text-primary-container',
        'approved': 'bg-emerald-100 text-emerald-700',
        'rejected': 'bg-error-container text-error',
        'synced': 'bg-emerald-100 text-emerald-700'
    };
    
    const statusText = {
        'pending': 'Pendiente',
        'sent': 'Enviado',
        'approved': 'Aprobado',
        'rejected': 'Rechazado',
        'synced': 'Completado'
    };
    
    if (syncStatus === 'pending') {
        return `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-amber-100 text-amber-700">Sinc. pendiente</span>`;
    }
    
    return `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${statusMap[status] || statusMap['pending']}">${statusText[status] || 'Pendiente'}</span>`;
}

// ========== MANEJO DE DETALLES DEL VALE ==========
let currentVoucherId = null;

async function openVoucherDetail(voucherId) {
    currentVoucherId = voucherId;
    const voucher = (await db.getAllVouchers()).find(v => v.id === voucherId);
    if (!voucher) return;
    
    // Actualizar el drawer con los datos del vale
    updateDrawerWithVoucher(voucher);
    toggleDrawer();
}

function updateDrawerWithVoucher(voucher) {
    const drawer = document.getElementById('details-drawer');
    if (!drawer) return;
    
    // Actualizar contenido del drawer
    const statusEl = drawer.querySelector('.status-text');
    const createdEl = drawer.querySelector('.created-date');
    const referenceEl = drawer.querySelector('.reference-number');
    const clientNameEl = drawer.querySelector('.client-name');
    const clientAddressEl = drawer.querySelector('.client-address');
    const clientEmailEl = drawer.querySelector('.client-email');
    const itemsContainer = drawer.querySelector('.items-container');
    const totalEl = drawer.querySelector('.total-amount');
    
    if (statusEl) statusEl.textContent = `Estado: ${getStatusText(voucher.status)}`;
    if (createdEl) createdEl.textContent = formatDate(voucher.createdAt) + ' ' + formatTime(voucher.createdAt);
    if (referenceEl) referenceEl.textContent = voucher.voucherNumber || 'VCH-' + voucher.id.slice(-6);
    if (clientNameEl) clientNameEl.textContent = voucher.client?.name || 'No especificado';
    if (clientAddressEl) clientAddressEl.textContent = voucher.client?.address || 'No especificada';
    if (clientEmailEl) clientEmailEl.textContent = voucher.client?.email || 'No especificado';
    
    if (itemsContainer && voucher.product) {
        itemsContainer.innerHTML = `
            <div class="p-3 flex justify-between border-b border-outline-variant text-body-sm">
                <span>${voucher.product.name}</span>
                <span class="font-data-mono">$${voucher.product.basePrice?.toLocaleString() || '0'}</span>
            </div>
            <div class="p-3 flex justify-between border-b border-outline-variant text-body-sm">
                <span>Comisión (${voucher.product.commissionPercent || 0}%)</span>
                <span class="font-data-mono">$${((voucher.product.basePrice || 0) * (voucher.product.commissionPercent || 0) / 100).toLocaleString()}</span>
            </div>
        `;
    }
    
    if (totalEl) totalEl.textContent = `$${voucher.totalAmount?.toLocaleString() || '0'}`;
}

function getStatusText(status) {
    const map = {
        'pending': 'Pendiente',
        'sent': 'Enviado al Proveedor',
        'approved': 'Aprobado',
        'rejected': 'Rechazado',
        'synced': 'Completado'
    };
    return map[status] || 'Pendiente';
}

async function retrySync(voucherId) {
    if (!isOnline) {
        showToast('Conecta a internet para sincronizar', 'warning');
        return;
    }
    
    const voucher = (await db.getAllVouchers()).find(v => v.id === voucherId);
    if (voucher) {
        await db.addToSyncQueue('update', 'vouchers', voucherId, voucher);
        await processSync();
    }
}

// ========== FUNCIONES GLOBALES ==========
window.openVoucherDetail = openVoucherDetail;
window.retrySync = retrySync;
window.toggleDrawer = function() {
    const drawer = document.getElementById('details-drawer');
    if (drawer) {
        if (drawer.classList.contains('translate-x-full')) {
            drawer.classList.remove('translate-x-full');
        } else {
            drawer.classList.add('translate-x-full');
        }
    }
};

// Cargar datos según la página actual
async function loadPageData() {
    const path = window.location.pathname;
    
    if (path.includes('home-managers.html')) {
        await loadDashboardMetrics();
        await loadRecentActivity();
    } else if (path.includes('histori-vouche.html')) {
        await loadVouchersList();
    }
}

async function loadRecentActivity() {
    const vouchers = await db.getAllVouchers();
    const recent = vouchers.sort((a, b) => b.createdAt - a.createdAt).slice(0, 4);
    
    const tbody = document.querySelector('#recent-activity-body');
    if (!tbody) return;
    
    tbody.innerHTML = recent.map(voucher => `
        <tr class="hover:bg-surface-container-low transition-colors group cursor-pointer" onclick="openVoucherDetail('${voucher.id}')">
            <td class="p-3 md:p-4 font-data-mono text-xs md:text-data-mono">${voucher.voucherNumber || 'VCH-' + voucher.id.slice(-6)}</td>
            <td class="p-3 md:p-4 text-xs md:text-body-sm font-body-md text-on-surface">${voucher.client?.name || 'Cliente'}</td>
            <td class="p-3 md:p-4 font-data-mono text-xs md:text-data-mono font-bold">$${voucher.totalAmount?.toLocaleString() || '0'}</td>
            <td class="p-3 md:p-4">${getStatusBadgeMini(voucher.status)}</td>
            <td class="p-3 md:p-4 text-xs md:text-body-sm text-on-surface-variant">${formatRelativeTime(voucher.createdAt)}</td>
        </tr>
    `).join('');
}

function getStatusBadgeMini(status) {
    const map = {
        'pending': '<span class="px-2 py-0.5 rounded bg-secondary-container text-on-secondary-container text-[9px] font-bold uppercase">Pendiente</span>',
        'sent': '<span class="px-2 py-0.5 rounded bg-primary-container/10 text-primary-container text-[9px] font-bold uppercase">Enviado</span>',
        'approved': '<span class="px-2 py-0.5 rounded bg-green-100 text-green-700 text-[9px] font-bold uppercase">Completado</span>',
        'synced': '<span class="px-2 py-0.5 rounded bg-green-100 text-green-700 text-[9px] font-bold uppercase">Completado</span>'
    };
    return map[status] || map['pending'];
}

function formatRelativeTime(timestamp) {
    if (!timestamp) return 'Fecha desconocida';
    const diff = Date.now() - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    
    if (minutes < 1) return 'hace un momento';
    if (minutes < 60) return `hace ${minutes} min`;
    if (hours < 24) return `hace ${hours} h`;
    return `hace ${days} d`;
}

// Inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    // Esperar a que db-manager.js cargue
    const checkDB = setInterval(() => {
        if (window.suitDB) {
            clearInterval(checkDB);
            initManagerViews();
        }
    }, 100);
});