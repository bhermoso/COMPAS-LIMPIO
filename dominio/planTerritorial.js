/**
 * COMPÁS — Entidad de dominio: Plan Territorial
 * dominio/planTerritorial.js
 *
 * ITERACIÓN 3 — Modelo explícito del plan territorial.
 *
 * CONTEXTO DEL SISTEMA HEREDADO:
 *   El monolito actual almacena UN ÚNICO plan por territorio en Firebase:
 *     estrategias/{est}/municipios/{mun}/planAccion:
 *       { fechaISO, seleccionEPVSA, actuaciones, version }
 *   No hay identificador de plan, no hay número de orden, no hay estado.
 *   No hay soporte para planes sucesivos del mismo territorio.
 *
 * QUÉ HACE ESTE MÓDULO:
 *   - Define el modelo completo de PlanTerritorial con todos los campos
 *     pedidos en las reglas de dominio
 *   - Introduce RegistroPlanes: estructura en memoria que permite
 *     representar MÚLTIPLES planes por ámbito sin romper el sistema actual
 *   - Provee bridge desde el formato Firebase heredado → PlanTerritorial
 *   - NO modifica Firebase ni el monolito
 *   - NO asume un único plan por territorio en el nuevo código modular
 *
 * MÓDULO PURO: Sin acceso al DOM, sin acceso a Firebase, sin efectos secundarios.
 *
 * NOTAS PROVISIONALES (ver sección al final del archivo):
 *   - Las fechas por defecto (2026-01-01 / 2030-12-31) son PROVISIONALES.
 *     Reflejan el período EPVSA actual pero deben derivarse de la config.
 *   - El monolito sigue usando planLocalSalud y window.COMPAS.state.planAccion
 *     como estado primario. Este modelo es la capa modular adicional.
 *   - RegistroPlanes es in-memory; la persistencia multi-plan en Firebase
 *     se implementará en una iteración futura de persistencia.
 */

// ─────────────────────────────────────────────────────────────────────────────
// ESTADOS DEL PLAN
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Estados posibles del plan territorial a lo largo de su ciclo de vida.
 *
 * BORRADOR:   El plan está en elaboración; no tiene selección EPVSA consolidada.
 *             Equivale a planLocalSalud.planAccion.completado === false en el monolito.
 *
 * ACTIVO:     El plan ha sido generado y guardado. Es el plan vigente del territorio.
 *             Equivale a que existe planAccion en Firebase con seleccionEPVSA no vacía.
 *
 * CERRADO:    El período del plan ha concluido. Sigue siendo consultable pero
 *             no se puede editar. (No existe equivalente en el monolito actual.)
 *
 * ARCHIVADO:  Plan histórico. Puede existir cuando un territorio ha completado
 *             un plan y comenzado uno nuevo (planes sucesivos). (No existe en monolito.)
 */
export const ESTADOS_PLAN = Object.freeze({
    BORRADOR:  'borrador',
    ACTIVO:    'activo',
    CERRADO:   'cerrado',
    ARCHIVADO: 'archivado',
});

const _ESTADOS_VALIDOS = new Set(Object.values(ESTADOS_PLAN));

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTES PROVISIONALES
//
// ⚠️  PROVISIONAL: Estos valores reflejan el período EPVSA 2024-2030.
//     En el monolito equivalen a los hardcodes: año: 2026 (planLocalSalud.agenda.año)
//     y ['2026','2027','2028','2029','2030'] (renderTimeline).
//     Deben derivarse de la configuración de estrategia cuando se extraiga esa lógica.
//     Ver LISTA_HARDCODING.md H04 y MIGRACION_CONTEXTO.md §4.
// ─────────────────────────────────────────────────────────────────────────────

/** @provisional */
const _ANIO_INICIO_DEFECTO = 2026;
/** @provisional */
const _ANIO_FIN_DEFECTO    = 2030;

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS INTERNOS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Genera un ID de plan determinista a partir del ámbito y el número de orden.
 * Formato: `{ambitoId}__plan_{numeroOrden}`
 * Permite reconstruir el ID desde los datos sin necesidad de almacenarlo por separado.
 * @private
 */
function _generarId(ambitoId, numeroOrden) {
    return `${ambitoId}__plan_${numeroOrden}`;
}

/**
 * Calcula el array de años cubiertos por el plan entre fechaInicio y fechaFin.
 * Ej: fechaInicio=2026, fechaFin=2030 → [2026, 2027, 2028, 2029, 2030]
 * @private
 */
function _calcularAniosCobertura(fechaInicio, fechaFin) {
    const anioInicio = fechaInicio instanceof Date
        ? fechaInicio.getFullYear()
        : parseInt(fechaInicio, 10);
    const anioFin = fechaFin instanceof Date
        ? fechaFin.getFullYear()
        : parseInt(fechaFin, 10);

    if (!anioInicio || !anioFin || anioInicio > anioFin) return [];
    const anios = [];
    for (let a = anioInicio; a <= anioFin; a++) anios.push(a);
    return anios;
}

/**
 * Normaliza una fecha a ISO string (YYYY-MM-DD).
 * Acepta string ISO, Date, o número (año).
 * @private
 */
function _normalizarFecha(valor, fallbackAnio, diaDefault = '01-01') {
    if (!valor) return `${fallbackAnio}-${diaDefault}`;
    if (valor instanceof Date) return valor.toISOString().slice(0, 10);
    if (typeof valor === 'number') return `${valor}-${diaDefault}`;
    if (typeof valor === 'string') {
        // Si es solo un año (4 dígitos), convertir a fecha completa
        if (/^\d{4}$/.test(valor)) return `${valor}-${diaDefault}`;
        // Si ya es ISO, devolver los primeros 10 caracteres
        return valor.slice(0, 10);
    }
    return `${fallbackAnio}-${diaDefault}`;
}

/**
 * Valida que los campos obligatorios de un plan estén presentes.
 * @private
 */
function _validar({ ambitoId, numeroOrden }) {
    if (!ambitoId || typeof ambitoId !== 'string' || ambitoId.trim() === '') {
        throw new Error(`[PlanTerritorial] "ambitoId" es obligatorio. Recibido: ${JSON.stringify(ambitoId)}`);
    }
    if (typeof numeroOrden !== 'number' || numeroOrden < 1 || !Number.isInteger(numeroOrden)) {
        throw new Error(`[PlanTerritorial] "numeroOrden" debe ser un entero ≥ 1. Recibido: ${JSON.stringify(numeroOrden)}`);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// ENTIDAD: PlanTerritorial
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Crea una entidad PlanTerritorial inmutable.
 *
 * @param {object}  datos
 * @param {string}  datos.ambitoId       - ID del AmbitoTerritorial al que pertenece
 * @param {number}  datos.numeroOrden    - Orden cronológico del plan para este ámbito (1, 2, 3…)
 * @param {*}       [datos.fechaInicio]  - Fecha inicio: ISO string, Date o año numérico
 * @param {*}       [datos.fechaFin]     - Fecha fin: ISO string, Date o año numérico
 * @param {string}  [datos.estado]       - Uno de ESTADOS_PLAN (por defecto: 'borrador')
 * @param {string}  [datos.estrategia]   - ID de la estrategia
 * @param {object}  [datos.seleccionEPVSA] - Selección de líneas/objetivos/programas (heredado)
 * @param {Array}   [datos.actuaciones]  - Actuaciones normalizadas del plan (heredado)
 * @param {string}  [datos.version]      - Versión interna ('auto', 'editado')
 * @param {string}  [datos.fechaGuardado] - ISO string de última vez guardado en Firebase
 * @param {object}  [datos.metadata]     - Datos adicionales libres
 *
 * @returns {Readonly<object>} Entidad PlanTerritorial inmutable
 * @throws {Error} Si los datos obligatorios son inválidos
 */
export function crearPlanTerritorial({
    ambitoId,
    numeroOrden,
    fechaInicio,
    fechaFin,
    estado       = ESTADOS_PLAN.BORRADOR,
    estrategia   = 'es-andalucia-epvsa',
    seleccionEPVSA = null,
    actuaciones  = [],
    version      = 'auto',
    fechaGuardado = null,
    metadata     = {},
} = {}) {
    _validar({ ambitoId, numeroOrden });

    // Normalizar estado
    const estadoNorm = _ESTADOS_VALIDOS.has(estado) ? estado : ESTADOS_PLAN.BORRADOR;

    // Normalizar fechas
    //   ⚠️ PROVISIONAL: si no se proveen fechas, se usan los defaults del período EPVSA actual.
    //   En una iteración futura, estos defaults deben derivarse de la config de estrategia.
    const fechaInicioNorm = _normalizarFecha(fechaInicio, _ANIO_INICIO_DEFECTO, '01-01');
    const fechaFinNorm    = _normalizarFecha(fechaFin,    _ANIO_FIN_DEFECTO,    '12-31');

    // Calcular campos derivados
    const aniosCobertura = _calcularAniosCobertura(fechaInicioNorm, fechaFinNorm);
    const esPrimerPlan   = numeroOrden === 1;
    const id             = _generarId(ambitoId, numeroOrden);
    const tienePlan      = seleccionEPVSA !== null && Array.isArray(seleccionEPVSA) && seleccionEPVSA.length > 0;

    return Object.freeze({
        // ── Identificación ─────────────────────────────────────────────────
        id,
        ambitoId,
        estrategia,
        numeroOrden,
        esPrimerPlan,

        // ── Período temporal ───────────────────────────────────────────────
        fechaInicio:    fechaInicioNorm,
        fechaFin:       fechaFinNorm,
        aniosCobertura: Object.freeze([...aniosCobertura]),

        // ── Estado del ciclo de vida ───────────────────────────────────────
        estado:  estadoNorm,
        esActivo:    estadoNorm === ESTADOS_PLAN.ACTIVO,
        esBorrador:  estadoNorm === ESTADOS_PLAN.BORRADOR,
        esCerrado:   estadoNorm === ESTADOS_PLAN.CERRADO,
        esArchivado: estadoNorm === ESTADOS_PLAN.ARCHIVADO,

        // ── Contenido del plan (bridge con sistema heredado) ───────────────
        //    ⚠️ PROVISIONAL: Estos campos son el puente hacia el formato Firebase
        //    actual. Cuando se extraigan guardarPlanEnFirebase/cargarPlanGuardado
        //    al módulo de persistencia, el modelo aquí se actualizará.
        tienePlan,
        seleccionEPVSA: seleccionEPVSA ? Object.freeze(seleccionEPVSA) : null,
        actuaciones:    Object.freeze([...(actuaciones || [])]),
        version,
        fechaGuardado,

        // ── Metadata libre ─────────────────────────────────────────────────
        metadata: Object.freeze({ ...metadata }),

        // ── Representación canónica ────────────────────────────────────────
        toString() {
            return `PlanTerritorial(${this.id} [${this.estado}] ${this.fechaInicio}→${this.fechaFin})`;
        },
        toJSON() {
            return {
                id, ambitoId, estrategia, numeroOrden, esPrimerPlan,
                fechaInicio: fechaInicioNorm, fechaFin: fechaFinNorm,
                aniosCobertura: [...aniosCobertura],
                estado: estadoNorm, tienePlan,
                version, fechaGuardado, metadata,
            };
        },
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// BRIDGE DESDE FORMATO FIREBASE HEREDADO
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Crea un PlanTerritorial desde el objeto planAccion almacenado en Firebase.
 * El formato Firebase actual es: { fechaISO, seleccionEPVSA, actuaciones, version }
 *
 * ⚠️ PROVISIONAL:
 *   - El monolito guarda un único plan por territorio. El sistema nuevo asume
 *     que ese plan es el plan número 1 del ámbito (numeroOrden = 1).
 *   - Si en el futuro se guarda un segundo plan, el bridge deberá deducir
 *     el numeroOrden desde el historial de Firebase (no implementado aún).
 *   - El estado se infiere como ACTIVO si la selección no está vacía.
 *
 * @param {string}  ambitoId      - Clave del territorio
 * @param {object}  planFirebase  - Objeto leído de Firebase ({ fechaISO, seleccionEPVSA, actuaciones, version })
 * @param {number}  [numeroOrden] - Número de orden del plan (default: 1)
 * @param {string}  [estrategia]
 * @returns {Readonly<object>|null} PlanTerritorial, o null si planFirebase está vacío/nulo
 */
export function planDesdeFirebase(ambitoId, planFirebase, numeroOrden = 1, estrategia = 'es-andalucia-epvsa') {
    if (!planFirebase || !ambitoId) return null;
    const tieneSel = Array.isArray(planFirebase.seleccionEPVSA) && planFirebase.seleccionEPVSA.length > 0;
    return crearPlanTerritorial({
        ambitoId,
        numeroOrden,
        estrategia,
        // ⚠️ PROVISIONAL: sin fechaInicio/fechaFin en el formato Firebase actual.
        //    fechaGuardado (fechaISO) se usa como proxy de cuándo se guardó el plan,
        //    pero no es la fecha de inicio del plan de salud.
        fechaInicio:    null, // → fallback _ANIO_INICIO_DEFECTO (provisional)
        fechaFin:       null, // → fallback _ANIO_FIN_DEFECTO (provisional)
        estado:         tieneSel ? ESTADOS_PLAN.ACTIVO : ESTADOS_PLAN.BORRADOR,
        seleccionEPVSA: planFirebase.seleccionEPVSA || null,
        actuaciones:    planFirebase.actuaciones    || [],
        version:        planFirebase.version        || 'auto',
        fechaGuardado:  planFirebase.fechaISO       || null,
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// REGISTRO DE PLANES (permite múltiples planes por ámbito)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Crea un RegistroPlanes: estructura en memoria que indexa planes por ambitoId.
 *
 * DISEÑO:
 *   - Permite múltiples planes por ámbito (planes sucesivos en el tiempo)
 *   - Los planes de un mismo ámbito se ordenan por numeroOrden (ascendente)
 *   - "Plan activo" = el plan con estado ACTIVO de mayor numeroOrden
 *   - "Último plan" = el plan de mayor numeroOrden (sea cual sea su estado)
 *
 * LIMITACIÓN PROVISIONAL:
 *   El monolito solo soporta UN plan por territorio en Firebase.
 *   RegistroPlanes está preparado para múltiples planes, pero en la sesión
 *   actual siempre tendrá como máximo 1 plan por territorio hasta que
 *   la capa de persistencia soporte la ruta multi-plan en Firebase.
 *
 * @returns {object} Instancia del RegistroPlanes
 */
export function crearRegistroPlanes() {
    /** @type {Map<string, Array<Readonly<object>>>} ambitoId → PlanTerritorial[] */
    const _registro = new Map();

    return {
        /**
         * Registra un plan. Si ya existe uno con el mismo id lo reemplaza.
         * @param {Readonly<object>} plan - PlanTerritorial creado con crearPlanTerritorial()
         */
        registrar(plan) {
            if (!plan || !plan.ambitoId || !plan.id) {
                throw new Error('[RegistroPlanes] El plan debe tener ambitoId e id.');
            }
            const lista = _registro.get(plan.ambitoId) || [];
            // Reemplazar si ya existe el mismo id; añadir si no
            const idx = lista.findIndex(p => p.id === plan.id);
            if (idx !== -1) {
                lista[idx] = plan;
            } else {
                lista.push(plan);
            }
            // Mantener ordenados por numeroOrden ascendente
            lista.sort((a, b) => a.numeroOrden - b.numeroOrden);
            _registro.set(plan.ambitoId, lista);
            return plan;
        },

        /**
         * Devuelve todos los planes de un ámbito, ordenados por numeroOrden.
         * @param {string} ambitoId
         * @returns {Readonly<object>[]}
         */
        obtenerPlanes(ambitoId) {
            return [...(_registro.get(ambitoId) || [])];
        },

        /**
         * Devuelve el plan activo del ámbito (estado ACTIVO + mayor numeroOrden).
         * @param {string} ambitoId
         * @returns {Readonly<object>|null}
         */
        obtenerPlanActivo(ambitoId) {
            const planes = _registro.get(ambitoId) || [];
            // Buscar de mayor a menor orden el primero con estado ACTIVO
            for (let i = planes.length - 1; i >= 0; i--) {
                if (planes[i].esActivo) return planes[i];
            }
            return null;
        },

        /**
         * Devuelve el plan de mayor número de orden para el ámbito,
         * independientemente de su estado.
         * @param {string} ambitoId
         * @returns {Readonly<object>|null}
         */
        obtenerUltimoPlan(ambitoId) {
            const planes = _registro.get(ambitoId) || [];
            return planes.length > 0 ? planes[planes.length - 1] : null;
        },

        /**
         * Devuelve el número de orden para el próximo plan de este ámbito.
         * Si no hay planes → 1. Si hay N planes → N+1.
         * @param {string} ambitoId
         * @returns {number}
         */
        siguienteNumeroOrden(ambitoId) {
            const planes = _registro.get(ambitoId) || [];
            return planes.length === 0 ? 1 : planes[planes.length - 1].numeroOrden + 1;
        },

        /**
         * Devuelve cuántos ámbitos tienen al menos un plan registrado.
         * @returns {number}
         */
        get totalAmbitos() {
            return _registro.size;
        },

        /**
         * Devuelve el total de planes registrados en todos los ámbitos.
         * @returns {number}
         */
        get totalPlanes() {
            let n = 0;
            _registro.forEach(lista => { n += lista.length; });
            return n;
        },

        /**
         * Elimina todos los planes de un ámbito del registro.
         * NO borra nada en Firebase.
         * @param {string} ambitoId
         */
        limpiarAmbito(ambitoId) {
            _registro.delete(ambitoId);
        },

        /**
         * Serialización de diagnóstico.
         * @returns {object}
         */
        toJSON() {
            const out = {};
            _registro.forEach((planes, ambitoId) => {
                out[ambitoId] = planes.map(p => p.toJSON());
            });
            return out;
        },
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compara dos planes por identidad de id.
 * @returns {boolean}
 */
export function sonMismoPlan(a, b) {
    if (!a || !b) return false;
    return a.id === b.id;
}

/**
 * Devuelve true si el plan cubre un año dado.
 * @param {Readonly<object>} plan
 * @param {number} anio
 * @returns {boolean}
 */
export function planCubreAnio(plan, anio) {
    return Array.isArray(plan.aniosCobertura) && plan.aniosCobertura.includes(anio);
}
