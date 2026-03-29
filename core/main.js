/**
 * COMPÁS — Punto de entrada modular
 * core/main.js
 *
 * ITERACIÓN 3 — Entidades de dominio base.
 *
 * CAMBIOS RESPECTO A ITERACIÓN 2:
 *   - Importa dominio/ambitoTerritorial.js y dominio/planTerritorial.js
 *   - Inicializa el RegistroPlanes global
 *   - Cuando hay un plan en Firebase cargado, lo eleva a PlanTerritorial
 *   - Publica window.COMPAS.__dominio con acceso a las entidades de dominio
 *   - Mantiene todo lo de la iteración 2 sin cambios
 *
 * ORDEN DE EJECUCIÓN (crítico):
 *   1. Código heredado inline del HTML (<script> clásico, ~l.4095–29854)
 *      → Firebase initializeApp, window.COMPAS, ESTRATEGIAS_SALUD, TERRITORIOS,
 *        todas las funciones globales, event listeners heredados
 *   2. Este módulo ES (diferido por defecto — corre después del parsing del DOM)
 *      → initEstadoGlobal()     — lee COMPAS_VERSION, estrategiaActual del heredado
 *      → initContextoTerritorial() — registra listener aditivo en #municipio
 *
 * INVARIANTES GARANTIZADOS:
 *   - window.COMPAS existe y sigue siendo el namespace operativo principal
 *   - window.COMPAS.state, .prioridades, .mapa: intactos
 *   - datosMunicipioActual, planLocalSalud, accionesAgenda: intactos en heredado
 *   - actualizarMunicipio(): sin modificar, sigue funcionando igual
 *   - getMunicipioActual(): sin modificar, sigue leyendo del DOM
 */

import { initEstadoGlobal, subscribe, setAmbitoActivo, setPlanActivo, ESTRATEGIA_POR_DEFECTO, ANIO_INICIO_IMPLANTACION, ANIO_FIN_PLAN } from './estadoGlobal.js';
import { initContextoTerritorial, getAmbitoActivo, getTerritoriosAgrupados } from './contextoTerritorial.js';
import { ambitoDesdeContexto, TIPOS_AMBITO } from '../dominio/ambitoTerritorial.js';
import { crearRegistroPlanes, planDesdeFirebase, ESTADOS_PLAN } from '../dominio/planTerritorial.js';

// ─── 1. VERIFICACIÓN DEL BRIDGE (heredado de iteración 1) ───────────────────
//
// El código heredado inicializa window.COMPAS en l.4242.
// Salvaguarda defensiva por si corriera en otro orden.

if (!window.COMPAS) {
    window.COMPAS = { state: {} };
    console.warn('[COMPÁS main.js] window.COMPAS no estaba inicializado. Creado desde main.js.');
}
if (!window.COMPAS.prioridades) {
    window.COMPAS.prioridades = { tematicas: null, epvsa: null, relas: null, fusion: null };
}
if (!window.COMPAS.mapa) {
    window.COMPAS.mapa = null;
}

// ─── 2. METADATOS DE ARRANQUE MODULAR ────────────────────────────────────────

window.COMPAS.__modular          = true;
window.COMPAS.__bootstrapVersion = '3.0.0'; // actualizado en iteración 3
window.COMPAS.__bootstrapFecha   = new Date().toISOString();
console.info('[COMPÁS modular] core cargado');

// ─── 3. INICIALIZACIÓN DEL ESTADO GLOBAL ────────────────────────────────────
//
// initEstadoGlobal() lee COMPAS_VERSION y estrategiaActual del código heredado
// (ya disponibles en window porque los <script> clásicos corrieron antes).

const estado = initEstadoGlobal();

// ─── 4. INICIALIZACIÓN DEL CONTEXTO TERRITORIAL ─────────────────────────────
//
// initContextoTerritorial() registra un listener ADITIVO en #municipio.
// El listener heredado (HTML l.13159) ya existe y llama a actualizarMunicipio();
// este listener solo sincroniza estadoGlobal y NO vuelve a llamar a actualizarMunicipio.

initContextoTerritorial();

// ─── 5. REGISTRO DE PLANES + INTEGRACIÓN CON ENTIDADES DE DOMINIO ────────────
//
// Crea el registro global de planes (en memoria, sin Firebase).
// Si hay un plan cargado en window.COMPAS.state.planAccionFirebase (cargado
// por el código heredado vía Firebase), lo eleva a entidad PlanTerritorial.
//
// IMPORTANTE: este bloque es puramente aditivo. NO modifica planLocalSalud
// ni window.COMPAS.state.planAccion. El sistema heredado sigue siendo la
// fuente de verdad operativa; este registro es la capa modular adicional.

const registroPlanes = crearRegistroPlanes();

// Exponer el registro y las factories en window.COMPAS.__dominio
// para que código heredado pueda acceder sin hacer imports ES.
window.COMPAS.__dominio = {
    // Tipos y constantes
    TIPOS_AMBITO,
    ESTADOS_PLAN,
    // Factories
    ambitoDesdeContexto,
    planDesdeFirebase,
    crearRegistroPlanes,
    // Registro global de esta sesión
    registroPlanes,
};

// Suscribirse al cambio de ámbito territorial para:
//   1. Elevar el { key, nombre, tipo, estrategia } a AmbitoTerritorial de dominio
//   2. Si hay plan Firebase ya cargado para ese ámbito, elevarlo a PlanTerritorial
subscribe('ambitoTerritorialActivo', (contextoNuevo) => {
    if (!contextoNuevo) return;

    // Elevar contexto a entidad de dominio
    const ambitoDominio = ambitoDesdeContexto(contextoNuevo);
    if (ambitoDominio && window.COMPAS.__dominio) {
        window.COMPAS.__dominio.ambitoActual = ambitoDominio;
    }

    // Si hay plan Firebase ya cargado, construir PlanTerritorial
    // (window.COMPAS.state.planAccionFirebase es cargado por cargarDatosMunicipioFirebase)
    const planFB = window.COMPAS.state && window.COMPAS.state.planAccionFirebase;
    if (planFB && contextoNuevo.key) {
        const plan = planDesdeFirebase(
            contextoNuevo.key,
            planFB,
            registroPlanes.siguienteNumeroOrden(contextoNuevo.key),
            contextoNuevo.estrategia
        );
        if (plan) {
            registroPlanes.registrar(plan);
            setPlanActivo(plan);
            if (window.COMPAS.__dominio) {
                window.COMPAS.__dominio.planActual = plan;
            }
        }
    }
});

// ─── 6. SUSCRIPTORES DE DIAGNÓSTICO (solo en desarrollo) ────────────────────
//
// Escuchan cambios de estado y los loguean. En producción se pueden silenciar
// poniendo window.__COMPAS_DEBUG = false antes de cargar el módulo.

if (window.__COMPAS_DEBUG !== false) {
    subscribe('ambitoTerritorialActivo', (nuevo, anterior) => {
        const keyNuevo = nuevo ? nuevo.key : null;
        const keyAnterior = anterior ? anterior.key : null;
        if (keyNuevo !== keyAnterior) {
            console.log('[estadoGlobal] 🗺️ Ámbito cambió:',
                keyAnterior || '(ninguno)', '→', keyNuevo || '(ninguno)',
                nuevo ? `[${nuevo.tipo}]` : '');
        }
    });
    subscribe('vistaActiva', (nuevo, anterior) => {
        if (nuevo !== anterior) {
            console.log('[estadoGlobal] 📋 Vista activa cambió:', anterior, '→', nuevo);
        }
    });
}

// ─── 7. LOG DE ARRANQUE ──────────────────────────────────────────────────────

console.groupCollapsed('[COMPÁS] Bootstrap modular v3 activo');
console.log('  Bootstrap version:', window.COMPAS.__bootstrapVersion);
console.log('  Timestamp:', window.COMPAS.__bootstrapFecha);
console.log('  Estrategia por defecto:', ESTRATEGIA_POR_DEFECTO);
console.log('  Período plan:', ANIO_INICIO_IMPLANTACION, '–', ANIO_FIN_PLAN);
console.log('  Estado global:', estado.configuracionSistema);
console.log('  Ámbito activo inicial:', getAmbitoActivo());
console.log('  Territorios disponibles:', getTerritoriosAgrupados());
console.log('  window.COMPAS.__estadoGlobal disponible:', !!window.COMPAS.__estadoGlobal);
console.log('  window.COMPAS.__contextoTerritorial disponible:', !!window.COMPAS.__contextoTerritorial);
console.log('  window.COMPAS.__dominio disponible:', !!window.COMPAS.__dominio);
console.log('  RegistroPlanes:', registroPlanes.totalAmbitos, 'ámbitos,', registroPlanes.totalPlanes, 'planes');
console.groupEnd();
console.info('[COMPÁS modular] bootstrap completo | window.COMPAS.__modular ===', window.COMPAS.__modular);

// ─── 8. IMPORTACIONES FUTURAS (pendientes de extracción) ────────────────────
//
// ITERACIÓN 4 — Persistencia / Firebase:
//   import { FirebaseAdapter } from '../persistencia/firebase/FirebaseAdapter.js';
//   import { FIREBASE_PATHS }  from '../persistencia/firebase/paths.js';
//
// ITERACIÓN 5 — Dominio / AgendaAnual:
//   import { AgendaAnual }     from '../dominio/plan/AgendaAnual.js';
//
// ITERACIÓN 6 — IA / Motor experto:
//   import { MotorExperto }    from '../ia/MotorExperto.js';
//
// ITERACIÓN 7 — UI / Fases:
//   import { Fase6Evaluacion } from '../ui/fases/Fase6_Evaluacion.js';

// ─── 9. EXPORTS ──────────────────────────────────────────────────────────────
//
// Exportar para que módulos ES futuros puedan importar directamente
// sin acceder a window.COMPAS.

export { getAmbitoActivo, getTerritoriosAgrupados };
export { subscribe } from './estadoGlobal.js';
export { ambitoDesdeContexto, TIPOS_AMBITO } from '../dominio/ambitoTerritorial.js';
export { planDesdeFirebase, ESTADOS_PLAN, crearRegistroPlanes } from '../dominio/planTerritorial.js';
export { registroPlanes };
export const COMPAS = window.COMPAS;
export default COMPAS;
