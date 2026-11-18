class SuitOfflineDB {
    constructor() {
        this.dbName = 'SuitOfflineDB';
        this.version = 1;
        this.db = null;
        this.isOnline = navigator.onLine;

        // Escuchar cambios de conectividad
        window.addEventListener('online', () => this.handleConnectivityChange(true));
        window.addEventListener('offline', () => this.handleConnectivityChange(false));
    }

    // Inicializar/abrir base de datos
    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.version);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                // Crear object stores si no existen
                if (!db.objectStoreNames.contains('vouchers')) {
                    const voucherStore = db.createObjectStore('vouchers', { keyPath: 'id' });
                    voucherStore.createIndex('status', 'status', { unique: false });
                    voucherStore.createIndex('createdAt', 'createdAt', { unique: false });
                    voucherStore.createIndex('syncStatus', 'syncStatus', { unique: false });
                }

                if (!db.objectStoreNames.contains('clients')) {
                    const clientStore = db.createObjectStore('clients', { keyPath: 'clientId' });
                    clientStore.createIndex('name', 'name', { unique: false });
                    clientStore.createIndex('phone', 'phone', { unique: false });
                }

                if (!db.objectStoreNames.contains('products')) {
                    const productStore = db.createObjectStore('products', { keyPath: 'productId' });
                    productStore.createIndex('name', 'name', { unique: false });
                    productStore.createIndex('price', 'price', { unique: false });
                }

                if (!db.objectStoreNames.contains('sync_queue')) {
                    const syncStore = db.createObjectStore('sync_queue', { keyPath: 'operationId' });
                    syncStore.createIndex('type', 'type', { unique: false });
                    syncStore.createIndex('timestamp', 'timestamp', { unique: false });
                    syncStore.createIndex('retryCount', 'retryCount', { unique: false });
                }

                if (!db.objectStoreNames.contains('settings')) {
                    db.createObjectStore('settings', { keyPath: 'key' });
                }
            };
        });
    }

    // ========== CRUD VOUCHERS ==========
    async createVoucher(voucher) {
        const transaction = this.db.transaction(['vouchers'], 'readwrite');
        const store = transaction.objectStore('vouchers');

        const newVoucher = {
            ...voucher,
            id: crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(),
            createdAt: Date.now(),
            updatedAt: Date.now(),
            syncStatus: this.isOnline ? 'synced' : 'pending'
        };

        return new Promise((resolve, reject) => {
            const request = store.add(newVoucher);
            request.onsuccess = () => {
                // Si está offline, agregar a cola de sincronización
                if (!this.isOnline) {
                    this.addToSyncQueue('create', 'vouchers', newVoucher.id, newVoucher);
                }
                resolve(newVoucher);
            };
            request.onerror = () => reject(request.error);
        });
    }

    async getAllVouchers() {
        const transaction = this.db.transaction(['vouchers'], 'readonly');
        const store = transaction.objectStore('vouchers');

        return new Promise((resolve, reject) => {
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error);
        });
    }

    async getVouchersByStatus(status) {
        const transaction = this.db.transaction(['vouchers'], 'readonly');
        const store = transaction.objectStore('vouchers');
        const index = store.index('status');

        return new Promise((resolve, reject) => {
            const request = index.getAll(status);
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error);
        });
    }

    async updateVoucher(id, updates) {
        const transaction = this.db.transaction(['vouchers'], 'readwrite');
        const store = transaction.objectStore('vouchers');

        // Primero obtener el voucher actual
        const getRequest = store.get(id);

        return new Promise((resolve, reject) => {
            getRequest.onsuccess = () => {
                const voucher = getRequest.result;
                if (!voucher) return reject(new Error('Voucher no encontrado'));

                const updatedVoucher = {
                    ...voucher,
                    ...updates,
                    updatedAt: Date.now(),
                    syncStatus: this.isOnline ? 'synced' : 'pending'
                };

                const putRequest = store.put(updatedVoucher);
                putRequest.onsuccess = () => {
                    if (!this.isOnline) {
                        this.addToSyncQueue('update', 'vouchers', id, updatedVoucher);
                    }
                    resolve(updatedVoucher);
                };
                putRequest.onerror = () => reject(putRequest.error);
            };
            getRequest.onerror = () => reject(getRequest.error);
        });
    }

    async deleteVoucher(id) {
        const transaction = this.db.transaction(['vouchers'], 'readwrite');
        const store = transaction.objectStore('vouchers');

        return new Promise((resolve, reject) => {
            const request = store.delete(id);
            request.onsuccess = () => {
                if (!this.isOnline) {
                    this.addToSyncQueue('delete', 'vouchers', id, null);
                }
                resolve();
            };
            request.onerror = () => reject(request.error);
        });
    }

    // ========== CRUD CLIENTS ==========
    async saveClient(client) {
        const transaction = this.db.transaction(['clients'], 'readwrite');
        const store = transaction.objectStore('clients');

        const newClient = {
            ...client,
            clientId: client.clientId || crypto.randomUUID?.(),
            updatedAt: Date.now()
        };

        return new Promise((resolve, reject) => {
            const request = store.put(newClient);
            request.onsuccess = () => resolve(newClient);
            request.onerror = () => reject(request.error);
        });
    }

    async getAllClients() {
        const transaction = this.db.transaction(['clients'], 'readonly');
        const store = transaction.objectStore('clients');

        return new Promise((resolve, reject) => {
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error);
        });
    }

    // ========== CRUD PRODUCTS ==========
    async saveProduct(product) {
        const transaction = this.db.transaction(['products'], 'readwrite');
        const store = transaction.objectStore('products');

        const newProduct = {
            ...product,
            productId: product.productId || crypto.randomUUID?.(),
            updatedAt: Date.now()
        };

        return new Promise((resolve, reject) => {
            const request = store.put(newProduct);
            request.onsuccess = () => resolve(newProduct);
            request.onerror = () => reject(request.error);
        });
    }

    async getAllProducts() {
        const transaction = this.db.transaction(['products'], 'readonly');
        const store = transaction.objectStore('products');

        return new Promise((resolve, reject) => {
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error);
        });
    }

    // ========== COLAS DE SINCRONIZACIÓN ==========
    async addToSyncQueue(type, store, recordId, data) {
        const transaction = this.db.transaction(['sync_queue'], 'readwrite');
        const syncStore = transaction.objectStore('sync_queue');

        const operation = {
            operationId: crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(),
            type,           // 'create', 'update', 'delete'
            store,
            recordId,
            data,
            timestamp: Date.now(),
            retryCount: 0,
            status: 'pending'
        };

        return new Promise((resolve, reject) => {
            const request = syncStore.add(operation);
            request.onsuccess = () => resolve(operation);
            request.onerror = () => reject(request.error);
        });
    }

    async getPendingSyncOperations() {
        const transaction = this.db.transaction(['sync_queue'], 'readonly');
        const store = transaction.objectStore('sync_queue');

        return new Promise((resolve, reject) => {
            const request = store.getAll();
            request.onsuccess = () => {
                const all = request.result || [];
                const pending = all.filter(op => op.status === 'pending' && op.retryCount < 5);
                resolve(pending);
            };
            request.onerror = () => reject(request.error);
        });
    }

    async markSyncOperationComplete(operationId) {
        const transaction = this.db.transaction(['sync_queue'], 'readwrite');
        const store = transaction.objectStore('sync_queue');

        return new Promise((resolve, reject) => {
            const request = store.delete(operationId);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async markSyncOperationFailed(operationId) {
        const transaction = this.db.transaction(['sync_queue'], 'readwrite');
        const store = transaction.objectStore('sync_queue');

        const getRequest = store.get(operationId);

        return new Promise((resolve, reject) => {
            getRequest.onsuccess = () => {
                const op = getRequest.result;
                if (op) {
                    op.retryCount++;
                    op.status = op.retryCount >= 5 ? 'failed' : 'pending';
                    store.put(op);
                }
                resolve();
            };
            getRequest.onerror = () => reject(getRequest.error);
        });
    }

    // ========== SETTINGS ==========
    async getSetting(key, defaultValue = null) {
        const transaction = this.db.transaction(['settings'], 'readonly');
        const store = transaction.objectStore('settings');

        return new Promise((resolve) => {
            const request = store.get(key);
            request.onsuccess = () => resolve(request.result?.value ?? defaultValue);
            request.onerror = () => resolve(defaultValue);
        });
    }

    async setSetting(key, value) {
        const transaction = this.db.transaction(['settings'], 'readwrite');
        const store = transaction.objectStore('settings');

        return new Promise((resolve, reject) => {
            const request = store.put({ key, value, updatedAt: Date.now() });
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    // ========== MÉTRICAS PARA DASHBOARD ==========
    async getDashboardMetrics() {
        const vouchers = await this.getAllVouchers();

        const totalVouchers = vouchers.length;
        const pendingVouchers = vouchers.filter(v => v.status === 'pending' || v.status === 'sent').length;
        const completedVouchers = vouchers.filter(v => v.status === 'approved' || v.status === 'synced').length;

        const totalPendingCommission = vouchers
            .filter(v => v.status === 'pending' || v.status === 'sent')
            .reduce((sum, v) => sum + (v.totalAmount || 0), 0);

        const last7Days = vouchers.filter(v => v.createdAt > Date.now() - 7 * 24 * 60 * 60 * 1000);
        const weeklyVolume = last7Days.reduce((sum, v) => sum + (v.totalAmount || 0), 0);

        return {
            totalVouchers,
            pendingVouchers,
            completedVouchers,
            totalPendingCommission,
            weeklyVolume,
            isOnline: this.isOnline
        };
    }

    // ========== UTILIDADES ==========
    handleConnectivityChange(isOnline) {
        this.isOnline = isOnline;
        if (isOnline) {
            this.processSyncQueue();
        }
        // Disparar evento para que las vistas se actualicen
        window.dispatchEvent(new CustomEvent('connectivity-change', { detail: { isOnline } }));
    }

    async processSyncQueue() {
        if (!this.isOnline) return;

        const pendingOps = await this.getPendingSyncOperations();

        for (const op of pendingOps) {
            try {
                // Aquí iría la llamada a la API REST para sincronizar
                // const response = await fetch('/api/sync', { method: 'POST', body: JSON.stringify(op) });
                // if (response.ok) {
                //     await this.markSyncOperationComplete(op.operationId);
                //     // Actualizar syncStatus del registro local
                //     if (op.store === 'vouchers') {
                //         await this.updateVoucher(op.recordId, { syncStatus: 'synced' });
                //     }
                // } else {
                //     await this.markSyncOperationFailed(op.operationId);
                // }

                // SIMULACIÓN: marcamos como completado por ahora
                await this.markSyncOperationComplete(op.operationId);
                if (op.store === 'vouchers') {
                    await this.updateVoucher(op.recordId, { syncStatus: 'synced' });
                }
            } catch (error) {
                console.error('Error sincronizando operación:', error);
                await this.markSyncOperationFailed(op.operationId);
            }
        }
    }

    // Cargar datos iniciales de ejemplo (solo si la base está vacía)
    async loadInitialData() {
        const existingVouchers = await this.getAllVouchers();
        if (existingVouchers.length > 0) return;

        // Datos de ejemplo para demostración
        const sampleVouchers = [
            {
                id: 'sample-2',
                voucherNumber: 'VCH-88285',
                createdAt: Date.now() - 3 * 24 * 60 * 60 * 1000,
                updatedAt: Date.now() - 3 * 24 * 60 * 60 * 1000,
                client: { name: 'Sarah K. Retail', phone: '+34 611 234 567', address: '45 Commerce Ave' },
                product: { id: 'prod-2', name: 'Cloud Infrastructure', basePrice: 1700, commissionPercent: 10 },
                totalAmount: 1890,
                status: 'pending',
                syncStatus: 'synced',
                images: {}
            }
        ];

        for (const voucher of sampleVouchers) {
            await this.createVoucher(voucher);
        }

        // Datos de clientes de ejemplo
        const sampleClients = [
            { clientId: 'cli-1', name: 'Jameson D. Group', phone: '+34 612 345 678', address: '122 Industrial Way' },
        ];

        for (const client of sampleClients) {
            await this.saveClient(client);
        }

        // Productos de ejemplo
        const sampleProducts = [
            { productId: 'prod-1', name: 'Enterprise License', price: 3800, commissionPercent: 10 },
        ];

        for (const product of sampleProducts) {
            await this.saveProduct(product);
        }

        // Configuración inicial
        await this.setSetting('userPlan', 'free'); // 'free' o 'premium'
        await this.setSetting('lastSync', Date.now());
    }
}

// Exportar instancia única
const _suitDbInstance = new SuitOfflineDB();

window.suitDB = _suitDbInstance;


// Inicializar automáticamente
(async () => {
    try {
        await _suitDbInstance.init();
        await _suitDbInstance.loadInitialData();
        console.log('[DB] Base de datos inicializada correctamente');
    } catch (error) {
        console.error('[DB] Error en inicialización:', error);
    }
})();
