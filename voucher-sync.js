// voucher-sync.js (SOLO ONLINE)
// Capa de integración entre vouche.html y Supabase para subir imágenes y crear/actualizar vales.
// No maneja offline ni IndexedDB.

(function () {

    // =========================================================
    // MANEJO DE IMÁGENES → SUPABASE STORAGE
    // =========================================================

    function base64ToBlob(base64, mimeType = 'image/jpeg') {
        const byteCharacters = atob(base64.split(',')[1]);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        return new Blob([byteArray], { type: mimeType });
    }

    // =========================================================
    // REDIMENSIONAR IMAGEN (reduce tamaño y calidad)
    // =========================================================

    function resizeImage(base64, maxWidth = 800, maxHeight = 500, quality = 0.9) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                // Calcular nuevo tamaño manteniendo proporción
                let width = img.width;
                let height = img.height;
                if (width > height) {
                    if (width > maxWidth) {
                        height = Math.round((height * maxWidth) / width);
                        width = maxWidth;
                    }
                } else {
                    if (height > maxHeight) {
                        width = Math.round((width * maxHeight) / height);
                        height = maxHeight;
                    }
                }

                // Crear canvas y dibujar
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                // Exportar como JPEG con calidad ajustable
                const resizedBase64 = canvas.toDataURL('image/jpeg', quality);
                resolve(resizedBase64);
            };
            img.onerror = () => reject(new Error('Error al cargar la imagen para redimensionar'));
            img.src = base64;
        });
    }

    async function uploadImageToSupabase(base64Data, voucherNumber, side) {
        if (!base64Data || !base64Data.startsWith('data:image')) {
            return null; // No es una imagen Base64 válida
        }

        // 🔽 REDIMENSIONAR ANTES DE SUBIR
        try {
            base64Data = await resizeImage(base64Data, 1200, 1200, 0.8);
        } catch (err) {
            console.warn('[VoucherSync] No se pudo redimensionar, se usará la imagen original:', err);
            // Si falla, continuamos con la original
        }

        // Detectar el tipo MIME
        const mimeType = base64Data.match(/data:(image\/\w+);/)?.[1] || 'image/jpeg';
        const blob = base64ToBlob(base64Data, mimeType);

        // Generar nombre único y ruta
        const fileExt = mimeType.split('/')[1] || 'jpg';
        const fileName = `${voucherNumber}-${side}.${fileExt}`;
        const filePath = `${voucherNumber}/${fileName}`;  // Carpeta por número de vale

        // Subir a Supabase Storage
        const { data, error } = await window.suitSupabase.storage
            .from('vouches')
            .upload(filePath, blob, {
                contentType: mimeType,
                upsert: false,  // Si ya existe, no sobrescribir (cambiar a true si se desea)
            });

        if (error) {
            console.error(`[VoucherSync] Error subiendo imagen ${side}:`, error);
            throw new Error(`Error al subir imagen ${side}: ${error.message}`);
        }

        // El bucket 'vouches' es privado: no existe una URL pública que pedir.
        // Guardamos solo la ruta interna del archivo; las vistas que muestran
        // la imagen generan una URL firmada temporal bajo demanda con
        // createSignedUrl(), respetando las políticas RLS de Storage.
        return filePath;
    }

    async function processVoucherImages(voucher) {
        const voucherNumber = voucher.voucherNumber || `VCH-${Date.now()}`;
        let frontUrl = null;
        let backUrl = null;

        if (voucher.images?.frontId && voucher.images.frontId.startsWith('data:image')) {
            frontUrl = await uploadImageToSupabase(voucher.images.frontId, voucherNumber, 'front');
        } else {
            frontUrl = voucher.images?.frontId || null;
        }

        if (voucher.images?.backId && voucher.images.backId.startsWith('data:image')) {
            backUrl = await uploadImageToSupabase(voucher.images.backId, voucherNumber, 'back');
        } else {
            backUrl = voucher.images?.backId || null;
        }

        return { frontUrl, backUrl };
    }

    // =========================================================
    // OBTENER PERFIL DEL GESTOR (para manager_name)
    // =========================================================

    async function getCurrentManagerProfile() {
        try {
            const { data, error } = await window.suitSupabase.rpc('get_my_profile');
            if (error) throw error;
            return Array.isArray(data) ? data[0] : data;
        } catch (err) {
            console.warn('[VoucherSync] No se pudo obtener el perfil del gestor:', err.message);
            return null;
        }
    }

    // =========================================================
    // ENVIAR UN VALE AL PROVEEDOR (SOLO ONLINE)
    // =========================================================

    async function sendToProvider(voucher) {
        if (!voucher.reference || !voucher.reference.trim()) {
            throw new Error('El código de proveedor es obligatorio para enviar el vale.');
        }

        // 1. Obtener el nombre del gestor
        const profile = await getCurrentManagerProfile();
        const managerName = profile?.full_name || 'Gestor';

        // 2. Procesar imágenes (subir a Storage y obtener URLs)
        const { frontUrl, backUrl } = await processVoucherImages(voucher);

        // 3. Construir parámetros para la RPC
        const params = {
            p_voucher_number: voucher.voucherNumber || '',
            p_provider_code: voucher.reference || '',
            p_manager_name: managerName,
            p_client_name: voucher.client?.name || '',
            p_client_phone: voucher.client?.phone || '',
            p_client_address: voucher.client?.address || '',
            p_client_email: voucher.client?.email || '',
            p_product_name: voucher.product?.name || '',
            p_base_price: voucher.product?.basePrice ?? 0,
            p_commission_pct: voucher.product?.commissionPercent ?? 0,
            p_total_amount: voucher.totalAmount ?? 0,
            p_front_id_image: frontUrl,   // URL, no Base64
            p_back_id_image: backUrl,    // URL, no Base64
            p_notes: voucher.notes || '',
            p_status:         'pending'   // <--- ¡AÑADE ESTA LÍNEA!
        };

        // 4. Llamar a la RPC (crear o actualizar según si ya tiene supabaseId)
        let remoteVoucher;
        if (voucher.supabaseId) {
            const { data, error } = await window.suitSupabase.rpc('update_voucher', {
                p_id: voucher.supabaseId,
                ...params
            });
            if (error) throw error;
            remoteVoucher = Array.isArray(data) ? data[0] : data;
        } else {
            const { data, error } = await window.suitSupabase.rpc('create_voucher', params);
            if (error) throw error;
            remoteVoucher = Array.isArray(data) ? data[0] : data;
        }

        // 5. Devolver el resultado (sin guardar en IndexedDB)
        const result = {
            id: remoteVoucher.id,
            voucherNumber: remoteVoucher.voucher_number,
            ...remoteVoucher,
            // También devolver las URLs para que la vista pueda mostrarlas si quiere
            frontUrl,
            backUrl
        };

        console.log('[VoucherSync] Vale enviado correctamente:', result.id);
        return { local: result, remote: remoteVoucher };
    }

    // =========================================================
    // CANCELAR UN VALE (opcional)
    // =========================================================

    async function cancelVoucher(supabaseId) {
        if (!supabaseId) throw new Error('Se necesita el ID del vale en Supabase para cancelarlo.');
        const { error } = await window.suitSupabase.rpc('cancel_voucher', { p_id: supabaseId });
        if (error) throw error;
        console.log('[VoucherSync] Vale cancelado:', supabaseId);
    }

    // =========================================================
    // API PÚBLICA
    // =========================================================

    window.VoucherSync = {
        sendToProvider,
        cancelVoucher
    };




})();
