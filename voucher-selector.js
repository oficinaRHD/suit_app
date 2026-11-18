// voucher-selector.js
// Selector de vales guardados: carga, elimina o limpia un vale en el formulario.

(function () {
    const POLL_INTERVAL = 100;
    const MAX_ATTEMPTS = 50;

    const STATUS_LABELS = {
        draft: 'Borrador',
        pending: 'Pendiente',
        sent: 'Enviado',
        approved: 'Aprobado',
        synced: 'Sincronizado'
    };

    function waitForDependencies(callback) {
        let attempts = 0;
        const interval = setInterval(() => {
            attempts++;
            if (window.suitDB && window.suitDB.db && window.VouchePageAPI) {
                clearInterval(interval);
                callback();
            } else if (attempts >= MAX_ATTEMPTS) {
                clearInterval(interval);
                console.error('[VoucherSelector] Dependencias no disponibles (suitDB/VouchePageAPI)');
            }
        }, POLL_INTERVAL);
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
        const select = document.getElementById('saved-voucher-select');
        const loadBtn = document.getElementById('load-voucher-btn');
        const deleteBtn = document.getElementById('delete-voucher-btn');
        const clearBtn = document.getElementById('clear-voucher-btn');
        const infoEl = document.getElementById('loaded-voucher-info');

        if (!select || !loadBtn || !clearBtn) {
            console.warn('[VoucherSelector] Elementos del selector no encontrados en el DOM');
            return;
        }

        populateSelect(select);

        loadBtn.addEventListener('click', async () => {
            const voucherId = select.value;
            if (!voucherId) {
                window.showToast?.('Selecciona un vale para cargar', 'warning');
                return;
            }
            await loadVoucherIntoForm(voucherId, infoEl);
        });

        if (deleteBtn) {
            deleteBtn.addEventListener('click', async () => {
                const voucherId = select.value;
                if (!voucherId) {
                    window.showToast?.('Selecciona un vale para eliminar', 'warning');
                    return;
                }

                const selectedLabel = select.options[select.selectedIndex]?.textContent || '';
                const confirmed = confirm(`¿Eliminar el vale "${selectedLabel}"? Esta acción no se puede deshacer.`);
                if (!confirmed) return;

                await deleteVoucher(voucherId, select, infoEl);
            });
        }

        clearBtn.addEventListener('click', () => {
            select.value = '';
            window.VouchePageAPI.setCurrentVoucherId(null);
            window.resetForm?.();
            if (infoEl) {
                infoEl.classList.add('hidden');
                infoEl.textContent = '';
            }
            window.showToast?.('Formulario limpio. Listo para un nuevo vale.', 'info');
        });

        // Refrescar la lista cuando se guarde un vale (nuevo o actualizado)
        window.addEventListener('voucher-saved', () => populateSelect(select));
    }

    async function populateSelect(select) {
        try {
            const vouchers = await window.suitDB.getAllVouchers();
            vouchers.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

            const currentValue = select.value;

            while (select.options.length > 1) {
                select.remove(1);
            }

            vouchers.forEach((voucher) => {
                const option = document.createElement('option');
                option.value = voucher.id;
                const clientName = voucher.client?.name || 'Sin nombre';
                const statusLabel = STATUS_LABELS[voucher.status] || voucher.status || 'Desconocido';
                option.textContent = `${voucher.voucherNumber || 'S/N'} · ${clientName} · ${statusLabel}`;
                select.appendChild(option);
            });

            // Mantener selección si el vale sigue existiendo
            if ([...select.options].some(o => o.value === currentValue)) {
                select.value = currentValue;
            }

            console.log(`[VoucherSelector] ${vouchers.length} vales cargados en el selector`);
        } catch (error) {
            console.error('[VoucherSelector] Error cargando vales:', error);
        }
    }

    async function deleteVoucher(voucherId, select, infoEl) {
        window.showLoading?.();

        try {
            await window.suitDB.deleteVoucher(voucherId);

            // Si el vale eliminado es el que está cargado en el formulario, limpiar
            if (window.VouchePageAPI.getCurrentVoucherId() === voucherId) {
                window.VouchePageAPI.setCurrentVoucherId(null);
                window.resetForm?.();
                if (infoEl) {
                    infoEl.classList.add('hidden');
                    infoEl.textContent = '';
                }
            }

            select.value = '';
            await populateSelect(select);

            window.showToast?.('Vale eliminado correctamente', 'success');
        } catch (error) {
            console.error('[VoucherSelector] Error eliminando vale:', error);
            window.showToast?.('Error al eliminar el vale', 'error');
        } finally {
            window.hideLoading?.();
        }
    }

    async function loadVoucherIntoForm(voucherId, infoEl) {
        const api = window.VouchePageAPI;
        window.showLoading?.();

        try {
            const vouchers = await window.suitDB.getAllVouchers();
            const voucher = vouchers.find(v => v.id === voucherId);

            if (!voucher) {
                window.showToast?.('No se encontró el vale seleccionado', 'error');
                return;
            }

            const el = getFormElements();

            if (el.referenceInput) el.referenceInput.value = voucher.reference || '';
            if (el.clientNameInput) el.clientNameInput.value = voucher.client?.name || '';
            if (el.clientPhoneInput) el.clientPhoneInput.value = voucher.client?.phone || '';
            if (el.clientAddressTextarea) el.clientAddressTextarea.value = voucher.client?.address || '';

            if (el.productNameInput) el.productNameInput.value = voucher.product?.name || '';
            if (el.basePriceInput) el.basePriceInput.value = voucher.product?.basePrice ?? '';
            if (el.commissionInput) el.commissionInput.value = voucher.product?.commissionPercent ?? '';

            window.calculateTotal?.();
            if (el.totalOutput) el.totalOutput.value = (voucher.totalAmount ?? 0).toFixed(2);

            // Imágenes
            api.setImageData(voucher.images?.frontId || null, voucher.images?.backId || null);
            updateImageArea('id-upload-front', voucher.images?.frontId);
            updateImageArea('id-upload-back', voucher.images?.backId);

            api.setCurrentVoucherId(voucher.id);

            if (infoEl) {
                const statusLabel = STATUS_LABELS[voucher.status] || voucher.status || '';
                infoEl.textContent = `Editando vale ${voucher.voucherNumber || ''} (${statusLabel})`;
                infoEl.classList.remove('hidden');
            }

            window.showToast?.('Vale cargado en el formulario', 'success');

        } catch (error) {
            console.error('[VoucherSelector] Error cargando vale:', error);
            window.showToast?.('Error al cargar el vale', 'error');
        } finally {
            window.hideLoading?.();
        }
    }

    function updateImageArea(areaId, imageData) {
        const area = document.getElementById(areaId);
        if (!area) return;

        const p = area.querySelector('p:last-child');
        const icon = area.querySelector('.material-symbols-outlined');

        if (imageData) {
            area.classList.remove('border-dashed');
            area.classList.add('border-solid', 'border-primary', 'bg-primary/5');
            if (icon) {
                icon.textContent = 'check_circle';
                icon.classList.add('text-primary');
            }
            if (p) {
                p.textContent = 'Imagen cargada';
                p.classList.add('text-primary', 'text-xs', 'truncate', 'w-full');
            }
        } else {
            area.classList.remove('border-solid', 'border-primary', 'bg-primary/5');
            area.classList.add('border-dashed');
            if (icon) {
                icon.textContent = 'upload_file';
                icon.classList.remove('text-primary');
            }
            if (p) {
                p.textContent = 'Toca para subir o arrastra el archivo';
                p.classList.remove('text-primary', 'text-xs', 'truncate', 'w-full');
            }
        }
    }

    document.addEventListener('DOMContentLoaded', () => {
        waitForDependencies(init);
    });
})();
