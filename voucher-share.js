// voucher-share.js
// Compartir el vale actual (datos del formulario) vía WhatsApp y SMS.

(function () {
    const MAX_ATTEMPTS = 50;

    function waitForAPI(callback) {
        let attempts = 0;
        const interval = setInterval(() => {
            attempts++;
            if (window.VouchePageAPI) {
                clearInterval(interval);
                callback();
            } else if (attempts >= MAX_ATTEMPTS) {
                clearInterval(interval);
                console.error('[VoucherShare] VouchePageAPI no disponible');
            }
        }, 100);
    }

    function getFormElements() {
        return {
            clientNameInput: document.querySelector('input[placeholder="Ingrese nombre completo"]'),
            clientPhoneInput: document.querySelector('input[placeholder="+1 (555) 000-0000"]'),
            clientAddressTextarea: document.querySelector('textarea[placeholder="Calle, Ciudad, Código Postal"]'),
            productNameInput: document.getElementById('product-name-input'),
            basePriceInput: document.querySelector('input[placeholder="0.00"]'),
            commissionInput: document.querySelector('input[placeholder="15"]'),
            totalOutput: document.querySelector('input[value="0.00"]'),
            referenceInput: document.querySelector('input[placeholder="REF-00921"]')
        };
    }

    function init() {
        const whatsappBtn = document.getElementById('share-whatsapp-btn');
        const smsBtn = document.getElementById('share-sms-btn');

        if (whatsappBtn) {
            whatsappBtn.addEventListener('click', () => shareVoucher('whatsapp'));
        }
        if (smsBtn) {
            smsBtn.addEventListener('click', () => shareVoucher('sms'));
        }
    }

    // ========== NÚMERO DE VALE ==========
    async function getDisplayVoucherNumber() {
        const currentId = window.VouchePageAPI.getCurrentVoucherId();

        if (currentId && window.suitDB) {
            try {
                const vouchers = await window.suitDB.getAllVouchers();
                const voucher = vouchers.find(v => v.id === currentId);
                if (voucher?.voucherNumber) return voucher.voucherNumber;
            } catch (error) {
                console.warn('[VoucherShare] No se pudo obtener el número del vale guardado:', error);
            }
        }

        return window.generateVoucherNumber ? window.generateVoucherNumber() : 'S/N';
    }

    // ========== MENSAJE A COMPARTIR ==========
    async function buildShareMessage(el) {
        const clientName = el.clientNameInput?.value.trim() || 'Sin nombre';
        const clientPhone = el.clientPhoneInput?.value.trim() || 'N/D';
        const clientAddress = el.clientAddressTextarea?.value.trim() || 'N/D';
        const reference = el.referenceInput?.value.trim() || 'N/D';
        const basePrice = parseFloat(el.basePriceInput?.value || 0);
        const commission = parseFloat(el.commissionInput?.value || 0);
        const total = el.totalOutput?.value || '0.00';
        const productName = el.productNameInput?.value.trim() || 'Producto personalizado';
        const voucherNumber = await getDisplayVoucherNumber();

        return [
            '*Vale Suit*',
            `N°: ${voucherNumber}`,
            `Cliente: ${clientName}`,
            `Teléfono: ${clientPhone}`,
            `Dirección: ${clientAddress}`,
            `Producto: ${productName}`,
            `Precio base: $${basePrice.toFixed(2)}`,
            `Comisión: ${commission}%`,
            `Total a pagar: $${total}`,
            `Referencia: ${reference}`
        ].join('\n');
    }

    // ========== IMÁGENES ADJUNTAS ==========
    function dataURLtoFile(dataURL, filename) {
        try {
            const arr = dataURL.split(',');
            const mimeMatch = arr[0].match(/:(.*?);/);
            const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
            const bstr = atob(arr[1]);
            let n = bstr.length;
            const u8arr = new Uint8Array(n);
            while (n--) {
                u8arr[n] = bstr.charCodeAt(n);
            }
            return new File([u8arr], filename, { type: mime });
        } catch (error) {
            console.error('[VoucherShare] Error convirtiendo imagen a archivo:', error);
            return null;
        }
    }

    function getImageFiles() {
        const { front, back } = window.VouchePageAPI.getImageData();
        const files = [];

        if (front) {
            const f = dataURLtoFile(front, 'identificacion-frontal.jpg');
            if (f) files.push(f);
        }
        if (back) {
            const f = dataURLtoFile(back, 'identificacion-trasera.jpg');
            if (f) files.push(f);
        }

        return files;
    }

    // ========== COMPARTIR ==========
    async function shareVoucher(channel) {

        // Verificar acceso premium para distribución offline
        if (window.SUBSCRIPTION) {
            const hasAccess = await window.SUBSCRIPTION.checkFeature('offline_voucher_distribution');
            if (!hasAccess) {
                window.showToast?.('La distribución offline es una función premium. Suscríbete para desbloquearla.', 'warning');
                return;
            }
        } else {
            // Si SUBSCRIPTION no está disponible, mostramos error (no debería pasar)
            window.showToast?.('Sistema de suscripción no disponible', 'error');
            return;
        }

        const el = getFormElements();

        if (!el.clientNameInput || !el.clientNameInput.value.trim()) {
            window.showToast?.('Ingrese al menos el nombre del cliente antes de compartir', 'warning');
            return;
        }

        const message = await buildShareMessage(el);

        if (channel === 'whatsapp') {
            await shareViaWhatsapp(message);
        } else if (channel === 'sms') {
            shareViaSms(message);
        }
    }

    async function shareViaWhatsapp(message) {
        const files = getImageFiles();

        // Intento 1: Web Share API con imágenes adjuntas (abre el panel nativo
        // del sistema; el usuario elige WhatsApp). Solo funciona en HTTPS y
        // navegadores compatibles (Chrome/Edge Android, Safari iOS recientes).
        if (files.length > 0 && navigator.canShare && navigator.canShare({ files })) {
            try {
                await navigator.share({ text: message, files });
                window.showToast?.('Compartiendo vale...', 'info');
                return;
            } catch (error) {
                if (error.name === 'AbortError') return; // el usuario canceló
                console.warn('[VoucherShare] Web Share API falló, usando enlace de WhatsApp:', error);
            }
        }

        // Intento 2 (fallback): enlace wa.me, que SOLO admite texto.
        const encodedMessage = encodeURIComponent(message);
        window.open(`https://wa.me/?text=${encodedMessage}`, '_blank');

        if (files.length > 0) {
            window.showToast?.(
                'Tu navegador no permite adjuntar las imágenes automáticamente. Se abrió WhatsApp con los datos del vale; adjunta las fotos del carnet manualmente desde la galería.',
                'warning',
                6000
            );
        } else {
            window.showToast?.('Abriendo WhatsApp...', 'info');
        }
    }

    function shareViaSms(message) {
        const encodedMessage = encodeURIComponent(message);
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
        const separator = isIOS ? '&' : '?';

        window.location.href = `sms:${separator}body=${encodedMessage}`;

        const { front, back } = window.VouchePageAPI.getImageData();
        if (front || back) {
            window.showToast?.(
                'Los mensajes SMS no admiten imágenes adjuntas. Se abrió la app de Mensajes solo con el texto del vale.',
                'info',
                5000
            );
        } else {
            window.showToast?.('Abriendo Mensajes...', 'info');
        }
    }

    document.addEventListener('DOMContentLoaded', () => {
        waitForAPI(init);
    });
})();
