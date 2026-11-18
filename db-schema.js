// db-schema.js - Estructura de IndexedDB para Gestor Offline

const DB_NAME = 'SuitOfflineDB';
const DB_VERSION = 1;

// Tablas (Object Stores)
const STORES = {
    VOUCHERS: 'vouchers',           // Vales creados offline
    CLIENTS: 'clients',             // Clientes (para autocompletado)
    PRODUCTS: 'products',           // Productos (catálogo offline)
    SYNC_QUEUE: 'sync_queue',       // Operaciones pendientes de sincronizar
    SETTINGS: 'settings'            // Configuración local + plan
};

// Estructura de cada tabla
const SCHEMA = {
    [STORES.VOUCHERS]: {
        keyPath: 'id',
        indexes: [
            { name: 'status', keyPath: 'status' },
            { name: 'createdAt', keyPath: 'createdAt' },
            { name: 'syncStatus', keyPath: 'syncStatus' }  // 'synced', 'pending', 'failed'
        ]
    },
    [STORES.CLIENTS]: {
        keyPath: 'clientId',
        indexes: [
            { name: 'name', keyPath: 'name' },
            { name: 'phone', keyPath: 'phone' }
        ]
    },
    [STORES.PRODUCTS]: {
        keyPath: 'productId',
        indexes: [
            { name: 'name', keyPath: 'name' },
            { name: 'price', keyPath: 'price' }
        ]
    },
    [STORES.SYNC_QUEUE]: {
        keyPath: 'operationId',
        indexes: [
            { name: 'type', keyPath: 'type' },      // 'create', 'update', 'delete'
            { name: 'timestamp', keyPath: 'timestamp' },
            { name: 'retryCount', keyPath: 'retryCount' }
        ]
    },
    [STORES.SETTINGS]: {
        keyPath: 'key'
    }
};

// Modelo de datos para un VALE (Voucher)
const VoucherModel = {
    id: 'string (UUID)',
    voucherNumber: 'string (VCH-XXXXX)',
    createdAt: 'timestamp',
    updatedAt: 'timestamp',
    client: {
        name: 'string',
        phone: 'string',
        address: 'string',
        taxId: 'string (opcional)'
    },
    product: {
        id: 'string',
        name: 'string',
        basePrice: 'number',
        commissionPercent: 'number'
    },
    totalAmount: 'number',
    status: 'pending | sent | approved | rejected | synced',
    syncStatus: 'synced | pending | failed',
    images: {
        frontId: 'blob (opcional)',
        backId: 'blob (opcional)'
    },
    notes: 'string (opcional)'
};
