/**
 * COMPÁS — Estado global mínimo
 * core/estadoGlobal.js
 *
 * ITERACIÓN 2 — Fuente de verdad centralizada.
 *
 * Este módulo define el store mínimo del sistema.
 * NO reemplaza window.COMPAS ni las variables heredadas del monolito.
 * Actúa como capa adicional que:
 *   - Centraliza los cinco campos de estado estructural
 *   - Sincroniza con el sistema heredado (bridge bidireccional)
 *   - Expone pub/sub para que módulos futuros reaccionen a cambios
 *   - Resuelve hardcodes de primer nivel como constantes nombradas
 *
 * RELACIÓN CON EL SISTEMA HEREDADO:
 *   - window.COMPAS sigue siendo el namespace operativo principal
 *   - datosMunicipioActual y planLocalSalud siguen en el monolito
 *   - Este módulo lee de ellos pero no los reemplaza todavía
 *
 * NOTA DE EJECUCIÓN: Los <script> clásicos del HTML corren ANTES que este
 * módulo ES (los módulos son diferidos). Al ejecutarse, todas las variables
 * globales heredadas (COMPAS_VERSION, estrategiaActual, TERRITORIOS, etc.)
 * ya están disponibles en window.
 */

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTES DE PRIMER NIVEL
// (hardcodes elevados a constantes nombradas — ver LISTA_HARDCODING.md H02, H04)
//
// IMPORTANTE: Estas constantes viven aquí en el módulo modular.
// El monolito HTML sigue usando sus propios valores inline por compatibilidad.
// En iteraciones futuras, el monolito se actualizará para importar desde aquí.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ID de la estrategia activa por defecto.
 * Antes: var estrategiaActual = 'es-andalucia-epvsa'; (HTML l.4263, hardcodeada)
 * Ahora: constante nombrada, importable sin depender de variable global.
 */
export const ESTRATEGIA_POR_DEFECTO = 'es-andalucia-epvsa';

/**
 * Primer año del período de implantación del plan.
 * Antes: año: 2026 (HTML l.4229, l.4669 — hardcodeado en planLocalSalud)
 * Ahora: constante nombrada derivada del período EPVSA 2024-2030.
 * Actualizar aquí si cambia el período de planificación.
 */
export const ANIO_INICIO_IMPLANTACION = 2026;

/**
 * Último año del período de vigencia del plan.
 * Antes: ['2026','2027','2028','2029','2030'] (HTML l.13101, hardcodeado en renderTimeline)
 * Ahora: derivado de ANIO_INICIO_IMPLANTACION + duración del plan (5 años).
 */
export const ANIO_FIN_PLAN = 2030;

/** Duración en años del período de planificación vigente. */
export const DURACION_PLAN = ANIO_FIN_PLAN - ANIO_INICIO_IMPLANTACION + 1; // 5

// ─────────────────────────────────────────────────────────────────────────────
// STORE MÍNIMO
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Estado interno del sistema.
 * Usar siempre las funciones get/set exportadas — nunca acceder directamente.
 * @private
 */
const _estado = {

    /**
     * Ámbito territorial activo.
     * Estructura: { key: string, nombre: string, tipo: 'municipio'|'mancomunidad'|'distrito_municipal', estrategia: string }
     * Fuente canónica modular. Sincronizado con window.COMPAS.__ambitoActivo.
     * Fuente heredada equivalente: document.getElementById('municipio').value
     */
    ambitoTerritorialActivo: null,

    /**
     * Plan territorial activo.
     * Bridge hacia window.COMPAS.state.planAccion y planLocalSalud.planAccion.
     * No sustituye las fuentes heredadas todavía.
     * Estructura esperada: { fechaISO, seleccionEPVSA, actuaciones, version }
     */
    planTerritorialActivo: null,

    /**
     * Usuario activo.
     * PLACEHOLDER: el sistema actual no tiene autenticación.
     * Reservado para futuras iteraciones con perfiles de acceso y permisos.
     * Estructura futura: { id, nombre, perfil, permisos }
     */
    usuario: null,

    /**
     * Configuración del sistema activo.
     * Inicializada desde variables heredadas del monolito en initEstadoGlobal().
     * Centraliza los parámetros que antes estaban dispersos en COMPAS_VERSION,
     * estrategiaActual y constantes hardcodeadas del HTML.
     */
    configuracionSistema: {
        estrategiaId:          ESTRATEGIA_POR_DEFECTO,
        anioInicioImplantacion: ANIO_INICIO_IMPLANTACION,
        anioFinPlan:            ANIO_FIN_PLAN,
        duracionPlan:           DURACION_PLAN,
        version:               null, // poblado en init desde COMPAS_VERSION.numero
        organizacion:          null, // poblado en init desde COMPAS_VERSION.organizacion
        autor:                 null, // poblado en init desde COMPAS_VERSION.autor
    },

    /**
     * Vista activa: número de fase (1-6) o null.
     * Derivada del DOM (.fase.activa[data-fase]) en init.
     * Actualizada por el listener de cambio de fase.
     */
    vistaActiva: null,
};

// ─────────────────────────────────────────────────────────────────────────────
// PUB/SUB MÍNIMO
// ─────────────────────────────────────────────────────────────────────────────

/** @type {Map<string, Function[]>} */
const _suscriptores = new Map();

/**
 * Emite un cambio de campo a todos los suscriptores registrados.
 * @private
 */
function _emitir(campo, valorNuevo, valorAnterior) {
    const lista = _suscriptores.get(campo) || [];
    lista.forEach(fn => {
        try { fn(valorNuevo, valorAnterior, campo); }
        catch (e) { console.warn(`[estadoGlobal] Error en suscriptor de "${campo}":`, e); }
    });
    // Canal genérico '*' recibe todos los cambios
    (_suscriptores.get('*') || []).forEach(fn => {
        try { fn(campo, valorNuevo, valorAnterior); }
        catch (e) { console.warn('[estadoGlobal] Error en suscriptor global (*):',  e); }
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// API PÚBLICA
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Suscribirse a cambios de un campo del estado.
 * @param {string} campo  - Nombre del campo o '*' para todos los cambios.
 * @param {Function} fn   - Callback (valorNuevo, valorAnterior, campo).
 * @returns {Function}    - Función de unsuscribe.
 */
export function subscribe(campo, fn) {
    if (!_suscriptores.has(campo)) _suscriptores.set(campo, []);
    _suscriptores.get(campo).push(fn);
    // Retorna función de baja
    return function unsuscribe() {
        const lista = _suscriptores.get(campo);
        if (!lista) return;
        const idx = lista.indexOf(fn);
        if (idx !== -1) lista.splice(idx, 1);
    };
}

/**
 * Devuelve el valor de un campo concreto del estado.
 * @param {string} campo
 * @returns {*}
 */
export function get(campo) {
    return _estado[campo];
}

/**
 * Devuelve una copia superficial del estado completo (solo para inspección/debug).
 * No modificar el objeto devuelto directamente.
 * @returns {object}
 */
export function getEstado() {
    return Object.assign({}, _estado);
}

/**
 * Establece el ámbito territorial activo y notifica a suscriptores.
 * Sincroniza automáticamente con window.COMPAS.__ambitoActivo (bridge).
 *
 * @param {{ key: string, nombre: string, tipo: string, estrategia: string }|null} ambito
 */
export function setAmbitoActivo(ambito) {
    const anterior = _estado.ambitoTerritorialActivo;
    _estado.ambitoTerritorialActivo = ambito;

    // Bridge hacia window.COMPAS para lectura desde código heredado
    if (window.COMPAS) {
        window.COMPAS.__ambitoActivo = ambito;
    }

    _emitir('ambitoTerritorialActivo', ambito, anterior);
    return ambito;
}

/**
 * Establece el plan territorial activo.
 * Llamar desde cargarPlanGuardado() o guardarPlanEnFirebase() cuando se extraigan.
 *
 * @param {object|null} plan
 */
export function setPlanActivo(plan) {
    const anterior = _estado.planTerritorialActivo;
    _estado.planTerritorialActivo = plan;
    _emitir('planTerritorialActivo', plan, anterior);
    return plan;
}

/**
 * Actualiza la vista activa (fase 1-6).
 * @param {number|null} fase
 */
export function setVistaActiva(fase) {
    const anterior = _estado.vistaActiva;
    _estado.vistaActiva = fase;
    _emitir('vistaActiva', fase, anterior);
    return fase;
}

// ─────────────────────────────────────────────────────────────────────────────
// INICIALIZACIÓN
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Inicializa el estado global leyendo desde el sistema heredado.
 * Debe llamarse desde core/main.js, después de que el código heredado haya corrido.
 *
 * Efectos:
 *  - Puebla configuracionSistema desde COMPAS_VERSION y estrategiaActual (heredados)
 *  - Detecta la vista activa inicial desde el DOM
 *  - Expone la API en window.COMPAS.__estadoGlobal (puente para código heredado)
 *
 * @returns {object} El estado inicializado (solo para debug)
 */
export function initEstadoGlobal() {
    // 1. Configuración del sistema desde variables globales heredadas
    //    (ya disponibles porque los <script> clásicos corrieron antes)
    if (typeof COMPAS_VERSION !== 'undefined') {
        _estado.configuracionSistema.version      = COMPAS_VERSION.numero;
        _estado.configuracionSistema.organizacion = COMPAS_VERSION.organizacion;
        _estado.configuracionSistema.autor        = COMPAS_VERSION.autor;
    }
    if (typeof estrategiaActual !== 'undefined' && estrategiaActual) {
        _estado.configuracionSistema.estrategiaId = estrategiaActual;
    }

    // 2. Vista activa inicial desde DOM
    const faseActivaEl = document.querySelector('.fase.activa');
    if (faseActivaEl && faseActivaEl.dataset.fase) {
        _estado.vistaActiva = parseInt(faseActivaEl.dataset.fase, 10) || null;
    }

    // 3. Exponer API en window.COMPAS para acceso desde código heredado
    //    Permite que funciones del monolito lean el estado modular sin imports ES
    if (window.COMPAS) {
        window.COMPAS.__estadoGlobal = {
            get,
            getEstado,
            setAmbitoActivo,
            setPlanActivo,
            setVistaActiva,
            subscribe,
            config: _estado.configuracionSistema,
            constantes: {
                ESTRATEGIA_POR_DEFECTO,
                ANIO_INICIO_IMPLANTACION,
                ANIO_FIN_PLAN,
                DURACION_PLAN,
            },
        };
    }

    console.groupCollapsed('[estadoGlobal] Inicializado');
    console.log('  Configuración:', _estado.configuracionSistema);
    console.log('  Vista activa:', _estado.vistaActiva);
    console.log('  Puente en window.COMPAS.__estadoGlobal');
    console.groupEnd();

    return _estado;
}
