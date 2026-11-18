// supabase-client.js
// Cliente único de Supabase para toda la app Suit.
//
// IMPORTANTE: reemplaza los valores de SUPABASE_URL y SUPABASE_ANON_KEY
// con los de tu proyecto. Los encuentras en:
// Supabase Dashboard > Settings > API > Project URL / anon public key
//https://szerfamhvpkbbkrbnxpr.supabase.co
//szerfamhvpkbbkrbnxpr
//
// Este archivo debe cargarse DESPUÉS de:
// <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>

const SUPABASE_URL = 'https://szerfamhvpkbbkrbnxpr.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_XmTLkx14AFr9znbfA1hxew_9ftQimrm';

window.suitSupabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
    },
        // 👇 AÑADE ESTO
    realtime: {
        logLevel: 'debug',
        logger: (kind, msg, data) => {
            console.log(`[Realtime] ${kind}: ${msg}`, data)
        }
    }
});

// ========== UTILIDADES DE SESIÓN COMPARTIDAS ==========

// Espera a que window.suitDB (IndexedDB) esté disponible.
// Se usa para sincronizar la sesión de Supabase con el almacenamiento
// local que ya usa index.html para decidir a qué panel redirigir.
function suitWaitForDB(maxAttempts = 30) {
    return new Promise((resolve) => {
        let attempts = 0;
        const interval = setInterval(() => {
            if (window.suitDB) {
                clearInterval(interval);
                resolve(window.suitDB);
            } else if (attempts >= maxAttempts) {
                clearInterval(interval);
                console.error('[Suit] Timeout esperando suitDB');
                resolve(null);
            }
            attempts++;
        }, 100);
    });
}

// Guarda en IndexedDB el rol y el id del usuario autenticado para que
// index.html pueda mostrar el banner de "continuar sesión" offline-first.
// Guardar sesión completa (profile + session)
async function suitPersistSession(profile, session) {
    const db = await suitWaitForDB();
    if (!db) return;

    // Una cuenta recién creada aún no tiene rol (role = null): se guarda null
    // para que index/lobby NO ofrezcan "Continuar" hasta que elija su perfil
    // en select-role.html (y para limpiar el rol de una cuenta anterior).
    await db.setSetting('userRole', profile.role || null);
    await db.setSetting('userId', profile.id);
    await db.setSetting('userProfile', profile);
    await db.setSetting('userEmail', profile.email);
    await db.setSetting('sessionExpiry', Date.now() + 7 * 24 * 60 * 60 * 1000);
    if (session) {
        await db.setSetting('access_token', session.access_token);
        await db.setSetting('refresh_token', session.refresh_token);
    }
}

// Obtener tokens guardados
async function suitGetStoredTokens() {
    const db = await suitWaitForDB();
    if (!db) return null;
    const access_token = await db.getSetting('access_token', null);
    const refresh_token = await db.getSetting('refresh_token', null);
    if (!access_token || !refresh_token) return null;
    return { access_token, refresh_token };
}

// Limpiar sesión local (ya existía, añadir también tokens)
async function suitLogout() {
    try {
        await window.suitSupabase.auth.signOut();
    } catch (error) {
        console.error('[Suit] Error cerrando sesión en Supabase:', error);
    }

    const db = await suitWaitForDB();
    if (db) {
        await db.setSetting('userRole', null);
        await db.setSetting('userId', null);
        await db.setSetting('userProfile', null);
        await db.setSetting('userEmail', null);
        await db.setSetting('sessionExpiry', 0);
        await db.setSetting('access_token', null);
        await db.setSetting('refresh_token', null);
    }
}

// Redirige al panel correspondiente según el rol del perfil.
//  - manager  -> home-managers.html
//  - provider -> home-supplier.html
//  - sin rol  -> select-role.html (cuenta nueva que aún debe elegir su perfil)
//  - otro     -> login.html
function suitRedirectToDashboard(role) {
    if (role === 'manager') {
        window.location.href = 'home-managers.html';
    } else if (role === 'provider') {
        window.location.href = 'home-supplier.html';
    } else if (!role) {
        window.location.href = 'select-role.html';
    } else {
        window.location.href = 'login.html';
    }
}

// Devuelve el perfil del usuario autenticado (vía RPC get_my_profile) o null
// si no existe. Lanza el error de Supabase si la consulta falla (p. ej. sin red).
async function suitFetchMyProfile() {
    const { data, error } = await window.suitSupabase.rpc('get_my_profile');
    if (error) throw error;
    return (Array.isArray(data) ? data[0] : data) || null;
}

// Guard de rol para las vistas protegidas. Úsalo en cuanto tengas el perfil:
//
//     if (!suitEnforceRole(profile, 'manager')) return;
//
// Devuelve true si el perfil puede permanecer en la vista. Si no, redirige
// y devuelve false:
//  - sin perfil           -> login.html
//  - sin rol (null)       -> select-role.html
//  - rol de otro tipo     -> el panel que le corresponde
// Es solo experiencia de usuario: la seguridad real la imponen el servidor
// (RLS / RPC) y el trigger que protege profiles.role.
function suitEnforceRole(profile, expectedRole) {
    if (!profile) {
        window.location.replace('login.html');
        return false;
    }
    if (!profile.role) {
        window.location.replace('select-role.html');
        return false;
    }
    if (profile.role !== expectedRole) {
        suitRedirectToDashboard(profile.role);
        return false;
    }
    return true;
}


// Función para suscribir al usuario a las notificaciones push
async function subscribeToPushNotifications() {
  if (!('Notification' in window) || !('PushManager' in window)) {
    console.warn('Push no soportado en este navegador');
    return;
  }

  // 1. Pedir permiso
  let permission = Notification.permission;
  if (permission === 'default') {
    permission = await Notification.requestPermission();
  }
  if (permission !== 'granted') {
    console.warn('Permiso denegado para notificaciones');
    return;
  }

  // 2. Obtener el Service Worker registrado
  const registration = await navigator.serviceWorker.ready;

  // 3. Obtener la clave pública VAPID (debe ser la misma que configuramos en la Edge Function)
  // La podemos obtener desde una variable de entorno en el cliente o desde un endpoint.
  // Por simplicidad, la definimos aquí (debes reemplazar con tu VAPID_PUBLIC_KEY)
  const VAPID_PUBLIC_KEY = 'c673bbe858f047353de4cc4aa0f4b9dc034c9e2778697648438be68ccc4af8c2'; // ¡Reemplázala!

  try {
    // 4. Suscribir al usuario
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });

    // 5. Guardar la suscripción en la base de datos (via RPC o API)
    const { data, error } = await window.suitSupabase.rpc('save_push_subscription', {
      p_endpoint: subscription.endpoint,
      p_keys: subscription.toJSON().keys,
    });

    if (error) {
      console.error('Error guardando suscripción:', error);
    } else {
      console.log('Suscripción push guardada correctamente');
    }
  } catch (error) {
    console.error('Error al suscribir:', error);
  }
}

// Función auxiliar para convertir la clave VAPID de base64 a Uint8Array
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
