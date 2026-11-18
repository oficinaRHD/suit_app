// subscription.js
// Depende de window.suitSupabase (definido en supabase-client.js)

const SUBSCRIPTION = (() => {
    // Cache local para evitar consultas repetidas
    let cache = {
        status: null,
        features: {}
    };
    let cacheTime = 0;
    const CACHE_TTL = 30000; // 30 segundos

    // --- NUEVO: cache de usuario ---
    let cachedUser = null;
    let cachedUserTime = 0;
    const USER_TTL = 60000; // 1 minuto

    async function getCachedUser() {
        if (cachedUser && (Date.now() - cachedUserTime) < USER_TTL) {
            return cachedUser;
        }
        const { data: { user } } = await window.suitSupabase.auth.getUser();
        cachedUser = user;
        cachedUserTime = Date.now();
        return user;
    }

    // Función interna para consultar estado
async function fetchStatus() {
    const user = await getCachedUser();
    if (!user) return null;

    const { data, error } = await window.suitSupabase.rpc('get_user_subscription_status', {
        p_user_id: user.id
    });

    if (error) {
        console.error('[Subscription] Error fetching status:', error);
        return null;
    }

    // Normalizar: si data es null o no tiene campos, devolver un objeto con status 'none'
    if (!data || typeof data !== 'object') {
        return { status: 'none' };
    }

    // Asegurar que existan propiedades clave
    return {
        status: data.status || 'none',
        plan_name: data.plan_name || null,
        start_date: data.start_date || null,
        end_date: data.end_date || null,
        trial_end_date: data.trial_end_date || null,
        // cualquier otro campo que necesite la UI
        ...data
    };
}

    // Obtener estado de suscripción (con caché)
    async function getStatus() {
        if (cache.status && (Date.now() - cacheTime) < CACHE_TTL) {
            return cache.status;
        }
        return await fetchStatus();
    }

    // Verificar acceso a una feature
    async function checkFeature(featureName) {

        const user = await getCachedUser();
        if (!user) return false;

        // Usar caché por feature
        if (cache.features[featureName] && (Date.now() - cacheTime) < CACHE_TTL) {
            return cache.features[featureName];
        }

        const { data, error } = await window.suitSupabase.rpc('check_feature_access', {
            p_user_id: user.id,
            p_feature_name: featureName
        });


        if (error) {
            console.error('[Subscription] Error checking feature:', error);
            return false;
        }

        cache.features[featureName] = data;
        return data;
    }

    // Iniciar período de prueba (se llama después del registro)
    async function startTrial() {
        const { data: { user } } = await window.suitSupabase.auth.getUser();
        if (!user) return null;

        const { data, error } = await window.suitSupabase.rpc('activate_trial_for_user', {
            p_user_id: user.id
        });

        if (error) {
            console.error('[Subscription] Error starting trial:', error);
            return null;
        }
        // Invalidar caché
        cache.status = null;
        cache.features = {};
        cacheTime = 0;
        return data;
    }

    // Crear suscripción pagada (mock)
    async function createSubscription(planId, paymentProvider, paymentId) {
        const { data: { user } } = await window.suitSupabase.auth.getUser();
        if (!user) return null;

        const { data, error } = await window.suitSupabase.rpc('create_paid_subscription', {
            p_user_id: user.id,
            p_plan_id: planId,
            p_payment_provider: paymentProvider,
            p_payment_provider_id: paymentId
        });

        if (error) {
            console.error('[Subscription] Error creating subscription:', error);
            return null;
        }
        // Invalidar caché
        cache.status = null;
        cache.features = {};
        cacheTime = 0;
        return data;
    }

    // Función helper para mostrar indicador premium en la UI
    function renderPremiumIndicator() {
        const indicators = document.querySelectorAll('[data-premium]');
        indicators.forEach(async (el) => {
            const feature = el.dataset.premium;
            const hasAccess = await checkFeature(feature);
            if (!hasAccess) {
                el.classList.add('opacity-50', 'pointer-events-none', 'premium-locked');
                // Agregar ícono de corona y tooltip
                const lockSpan = document.createElement('span');
                lockSpan.className = 'material-symbols-outlined text-amber-400 text-sm ml-1 cursor-help';
                lockSpan.textContent = 'crown';
                lockSpan.title = 'Funcionalidad premium - Suscríbete para desbloquear';
                el.appendChild(lockSpan);
            } else {
                // Mostrar corona dorada para indicar que es premium activo
                const crownSpan = document.createElement('span');
                crownSpan.className = 'material-symbols-outlined text-amber-400 text-sm ml-1';
                crownSpan.textContent = 'crown';
                el.appendChild(crownSpan);
            }
        });
    }

    // Inicializar: aplica los indicadores premium a todos los elementos con data-premium
    async function init() {
        await renderPremiumIndicator();
    }

    // Exponer funciones públicas
    return {
        getStatus,
        checkFeature,
        startTrial,
        createSubscription,
        renderPremiumIndicator,
        init
    };
})();


window.SUBSCRIPTION = SUBSCRIPTION;
