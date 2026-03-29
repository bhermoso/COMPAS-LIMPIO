/**
 * COMPÁS — Entidad de dominio: Agenda Anual
 * dominio/agendaAnual.js
 *
 * ITERACIÓN 4 — Nivel operativo del plan territorial.
 *
 * REGLA DE DOMINIO (ver ARQUITECTURA_OBJETIVO.md):
 *   - Un plan territorial tiene tantas agendas anuales como anualidades dure.
 *   - Plan de acción y agenda anual son entidades DISTINTAS.
 *   - La agenda anual es el nivel OPERATIVO del plan.
 *   - Las agendas NO forman parte del compilado principal del plan.
 *
 * QUÉ ES UNA AGENDA ANUAL:
 *   La programación concreta de acciones para un año específico dentro del
 *   período de vigencia del plan. Responde a "¿qué vamos a hacer en 2026?"
 *   mientras que el plan de acción responde a "¿qué nos comprometemos a hacer?".
 *
 * ESTADO HEREDADO:
 *   El monolito NO tiene el concepto de AgendaAnual como entidad.
 *   Usa un array plano `accionesAgenda` (l.11563) que mezcla acciones de todos
 *   los años. Las vistas filtran por `accion.anio`.
 *   El bridge `agendaDesdeAccionesHeredadas()` reconstruye una AgendaAnual
 *   filtrando ese array por año.
 *
 * MÓDULO PURO: Sin DOM. Sin Firebase. Sin efectos secundarios.
 */

// ─────────────────────────────────────────────────────────────────────────────
// ESTADOS DE LA AGENDA
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Estados posibles de una agenda anual.
 */
export const ESTADOS_AGENDA = Object.freeze({
    PENDIENTE:  'pendiente',   // el año aún no ha llegado o no hay acciones
    ACTIVA:     'activa',      // año en curso, con acciones en ejecución
    CERRADA:    'cerrada',     // año concluido; agenda auditada
    ARCHIVADA:  'archivada',   // agenda histórica de un plan ya cerrado
});

const _ESTADOS_AGENDA_VALIDOS = new Set(Object.values(ESTADOS_AGENDA));

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS INTERNOS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Genera ID determinista para una AgendaAnual.
 * Formato: `{planTerritorialId}__agenda_{anio}`
 * @private
 */
function _generarId(planTerritorialId, anio) {
    return `${planTerritorialId}__agenda_${anio}`;
}

/**
 * Infiere el estado de la agenda según el año respecto al año actual.
 * ⚠️ PROVISIONAL: Solo heurística temporal. El estado debería mantenerse
 *    explícitamente y persistirse. Esta inferencia es un fallback de arranque.
 * @private
 */
function _inferirEstado(anio) {
    const anioActual = new Date().getFullYear();
    const anioNum = parseInt(anio, 10);
    if (!anioNum) return ESTADOS_AGENDA.PENDIENTE;
    if (anioNum < anioActual) return ESTADOS_AGENDA.CERRADA;
    if (anioNum === anioActual) return ESTADOS_AGENDA.ACTIVA;
    return ESTADOS_AGENDA.PENDIENTE;
}

function _validarAgenda({ planTerritorialId, anio }) {
    if (!planTerritorialId || typeof planTerritorialId !== 'string') {
        throw new Error(`[AgendaAnual] "planTerritorialId" es obligatorio. Recibido: ${JSON.stringify(planTerritorialId)}`);
    }
    const anioNum = parseInt(anio, 10);
    if (!anioNum || anioNum < 2000 || anioNum > 2100) {
        throw new Error(`[AgendaAnual] "anio" debe ser un año válido (2000-2100). Recibido: ${JSON.stringify(anio)}`);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// ENTIDAD: AgendaAnual
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Crea una entidad AgendaAnual inmutable.
 *
 * La agenda contiene referencias a acciones (por id), no las acciones completas.
 * Las entidades Accion son independientes y se consultan por su planTerritorialId
 * y agendaAnualId. Esto evita duplicar datos y mantiene la separación.
 *
 * @param {object}  datos
 * @param {string}  datos.planTerritorialId    - Referencia al PlanTerritorial
 * @param {number|string} datos.anio           - Año de la agenda (ej: 2026)
 * @param {Array}   [datos.accionesProgramadas] - Array de ids de acciones programadas
 * @param {string}  [datos.estado]             - Uno de ESTADOS_AGENDA
 * @param {string}  [datos.ambitoId]           - Referencia al ámbito (desnormalización opcional)
 * @param {string}  [datos.estrategia]         - ID de la estrategia
 * @param {object}  [datos.metadatos]          - Datos adicionales
 *
 * @returns {Readonly<object>} Entidad AgendaAnual inmutable
 * @throws {Error} Si los datos son inválidos
 */
export function crearAgendaAnual({
    planTerritorialId,
    anio,
    accionesProgramadas = [],
    estado              = null,   // null = inferir automáticamente
    ambitoId            = null,
    estrategia          = 'es-andalucia-epvsa',
    metadatos           = {},
} = {}) {
    _validarAgenda({ planTerritorialId, anio });

    const anioNum   = parseInt(anio, 10);
    const id        = _generarId(planTerritorialId, anioNum);
    const estadoNorm = _ESTADOS_AGENDA_VALIDOS.has(estado)
        ? estado
        : _inferirEstado(anioNum);

    return Object.freeze({
        // ── Identificación ─────────────────────────────────────────────────
        id,
        planTerritorialId,
        ambitoId,
        estrategia,
        anio: anioNum,

        // ── Estado ─────────────────────────────────────────────────────────
        estado:    estadoNorm,
        esActiva:  estadoNorm === ESTADOS_AGENDA.ACTIVA,
        esCerrada: estadoNorm === ESTADOS_AGENDA.CERRADA,

        // ── Acciones programadas ───────────────────────────────────────────
        //    Array de IDs de acciones (no las acciones completas).
        //    La separación entre agenda y acciones es intencional:
        //    - La agenda define QUÉ acciones se programan para ESTE año
        //    - Las acciones tienen su propia identidad y ciclo de vida
        accionesProgramadas: Object.freeze([...(accionesProgramadas || [])]),

        // ── Metadata ───────────────────────────────────────────────────────
        metadatos: Object.freeze({ ...metadatos }),

        toString() {
            return `AgendaAnual(${this.planTerritorialId} [${this.anio}] ${this.accionesProgramadas.length} acciones [${this.estado}])`;
        },
        toJSON() {
            return {
                id, planTerritorialId, ambitoId, estrategia, anio: anioNum,
                estado: estadoNorm, accionesProgramadas: [...(accionesProgramadas || [])],
            };
        },
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// BRIDGE DESDE FORMATO HEREDADO
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Reconstruye una AgendaAnual desde el array `accionesAgenda` del monolito,
 * filtrando por año.
 *
 * ⚠️ LIMITACIÓN PROVISIONAL:
 *   El monolito no tiene el concepto de AgendaAnual como entidad persistida.
 *   Esta función construye una agenda virtual para un año dado a partir del
 *   array plano `accionesAgenda`. No es la única fuente de verdad — el
 *   array heredado sigue siéndolo hasta que se extraiga la lógica.
 *
 * @param {Array}  accionesHeredadas    - Array accionesAgenda del monolito
 * @param {number|string} anio         - Año a reconstruir
 * @param {string} planTerritorialId
 * @param {string} [ambitoId]
 * @returns {Readonly<object>} AgendaAnual con los IDs de las acciones de ese año
 */
export function agendaDesdeAccionesHeredadas(accionesHeredadas, anio, planTerritorialId, ambitoId = null) {
    const lista = Array.isArray(accionesHeredadas) ? accionesHeredadas : [];
    const anioStr = String(anio);
    const accionesDelAnio = lista.filter(a => String(a.anio) === anioStr);
    const idsAcciones = accionesDelAnio.map(a => a.id);

    return crearAgendaAnual({
        planTerritorialId,
        anio,
        ambitoId,
        accionesProgramadas: idsAcciones,
        // Estado inferido automáticamente del año
    });
}

/**
 * Crea todas las AgendaAnual que corresponden al período de cobertura de un plan,
 * a partir del array heredado accionesAgenda.
 *
 * Por cada año en aniosCobertura se crea una agenda (aunque no tenga acciones).
 * Esto formaliza la regla "un plan tiene tantas agendas como anualidades dure".
 *
 * @param {Array}  accionesHeredadas    - Array accionesAgenda del monolito
 * @param {number[]} aniosCobertura    - Array de años del plan ([2026,...,2030])
 * @param {string} planTerritorialId
 * @param {string} [ambitoId]
 * @returns {Map<number, Readonly<object>>} Map anio → AgendaAnual
 */
export function agendasDesdePlan(accionesHeredadas, aniosCobertura, planTerritorialId, ambitoId = null) {
    const agendas = new Map();
    (aniosCobertura || []).forEach(anio => {
        const agenda = agendaDesdeAccionesHeredadas(
            accionesHeredadas, anio, planTerritorialId, ambitoId
        );
        agendas.set(anio, agenda);
    });
    return agendas;
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compara dos agendas por identidad de id.
 */
export function sonMismaAgenda(a, b) {
    if (!a || !b) return false;
    return a.id === b.id;
}

/**
 * Devuelve el número de acciones programadas en la agenda.
 */
export function contarAcciones(agenda) {
    return agenda && agenda.accionesProgramadas ? agenda.accionesProgramadas.length : 0;
}
