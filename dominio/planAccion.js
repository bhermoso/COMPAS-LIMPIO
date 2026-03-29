/**
 * COMPÁS — Entidad de dominio: Plan de Acción
 * dominio/planAccion.js
 *
 * ITERACIÓN 4 — Nivel estratégico del plan territorial.
 *
 * REGLA DE DOMINIO CLAVE:
 *   Plan de acción y agenda anual son entidades DISTINTAS.
 *   El plan de acción es el NIVEL ESTRATÉGICO: declara qué objetivos y
 *   programas EPVSA se activan para el territorio y el período.
 *   La agenda anual es el NIVEL OPERATIVO: programa las acciones concretas
 *   para cada año.
 *
 * DISTINCIÓN FUNDAMENTAL:
 *   PlanAccion pregunta  → "¿qué líneas, objetivos y programas EPVSA activamos?"
 *   AgendaAnual pregunta → "¿qué acciones concretas hacemos en 2026?"
 *   Accion responde      → "esta acción, con este responsable, este trimestre"
 *
 * LAS AGENDAS NO FORMAN PARTE DEL COMPILADO DEL PLAN:
 *   El documento de plan de acción (compilado principal) incluye:
 *     - selección EPVSA (objetivos y programas activados)
 *     - actuaciones tipo (el catálogo, no la programación)
 *   El documento de agenda (nivel operativo) incluye:
 *     - acciones programadas por año con responsables y fechas
 *
 * ESTADO HEREDADO:
 *   En el monolito, el PlanAccion se almacena como:
 *     Firebase: estrategias/{est}/municipios/{mun}/planAccion
 *       { fechaISO, seleccionEPVSA, actuaciones, version }
 *     En memoria: window.COMPAS.state.planAccion
 *              + planLocalSalud.planAccion
 *   La 'seleccionEPVSA' contiene la elección estratégica.
 *   Las 'actuaciones' son el array normalizado del plan (actuaciones-tipo,
 *   no las acciones concretas de la agenda).
 *
 * MÓDULO PURO: Sin DOM. Sin Firebase. Sin efectos secundarios.
 */

// ─────────────────────────────────────────────────────────────────────────────
// ESTADOS DEL PLAN DE ACCIÓN
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Estados posibles del plan de acción en su ciclo de vida estratégico.
 */
export const ESTADOS_PLAN_ACCION = Object.freeze({
    BORRADOR:   'borrador',    // en elaboración; no guardado en Firebase
    GENERADO:   'generado',    // generado en sesión; no confirmado
    GUARDADO:   'guardado',    // guardado en Firebase por el técnico
    EDITADO:    'editado',     // modificado respecto a la última versión guardada
});

const _ESTADOS_PA_VALIDOS = new Set(Object.values(ESTADOS_PLAN_ACCION));

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS INTERNOS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Genera ID determinista para un PlanAccion.
 * Formato: `{planTerritorialId}__planaccion_{version}`
 * @private
 */
function _generarId(planTerritorialId, version) {
    const vSafe = (version || 'auto').replace(/[^a-z0-9]/gi, '_');
    return `${planTerritorialId}__planaccion_${vSafe}`;
}

function _validarPlanAccion({ planTerritorialId }) {
    if (!planTerritorialId || typeof planTerritorialId !== 'string') {
        throw new Error(`[PlanAccion] "planTerritorialId" es obligatorio. Recibido: ${JSON.stringify(planTerritorialId)}`);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// ENTIDAD: PlanAccion
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Crea una entidad PlanAccion inmutable.
 *
 * CAMPOS ESTRATÉGICOS (nivel plan):
 *   - objetivos:    líneas y objetivos EPVSA seleccionados (la "seleccionEPVSA" del monolito)
 *   - acciones:     actuaciones-tipo activadas del catálogo EPVSA (NO las acciones de agenda)
 *
 * SEPARACIÓN AGENDA/PLAN:
 *   Este objeto NO contiene referencias a las AgendaAnual ni a las Accion.
 *   La conexión es unidireccional: las Accion y las AgendaAnual referencian
 *   al PlanTerritorial (y por tanto al PlanAccion), no al revés.
 *
 * @param {object}  datos
 * @param {string}  datos.planTerritorialId     - Referencia al PlanTerritorial
 * @param {string}  [datos.estado]              - Uno de ESTADOS_PLAN_ACCION
 * @param {string}  [datos.version]             - 'auto'|'editado' (campo heredado de Firebase)
 * @param {string}  [datos.fechaGuardado]       - ISO datetime de guardado
 *
 * NIVEL ESTRATÉGICO:
 * @param {Array}   [datos.objetivos]           - seleccionEPVSA normalizada (la elección estratégica)
 *   Formato: [{ id: 'LE1', objetivos: [{idx,indicadores}], programas: [{idx,actuaciones}] }, ...]
 *
 * @param {Array}   [datos.acciones]            - Actuaciones-tipo activadas del plan (NO agenda)
 *   Formato: [{lineaId, lineaCodigo, programaCodigo, codigo, nombre}, ...]
 *   ⚠️ NOTA: Estas son actuaciones-tipo del catálogo EPVSA, no las Accion de la agenda.
 *            No confundir con dominio/accion.js
 *
 * @param {object}  [datos.metadatos]
 *
 * @returns {Readonly<object>} Entidad PlanAccion inmutable
 */
export function crearPlanAccion({
    planTerritorialId,
    estado          = ESTADOS_PLAN_ACCION.BORRADOR,
    version         = 'auto',
    fechaGuardado   = null,
    objetivos       = [],     // seleccionEPVSA
    acciones        = [],     // actuaciones-tipo activadas
    metadatos       = {},
} = {}) {
    _validarPlanAccion({ planTerritorialId });

    const estadoNorm = _ESTADOS_PA_VALIDOS.has(estado)
        ? estado
        : ESTADOS_PLAN_ACCION.BORRADOR;

    const id = _generarId(planTerritorialId, version);

    // Derivados del contenido
    const tieneContenido = Array.isArray(objetivos) && objetivos.length > 0;
    const totalLineas    = tieneContenido ? objetivos.length : 0;
    const totalAcciones  = Array.isArray(acciones) ? acciones.length : 0;

    return Object.freeze({
        // ── Identificación ─────────────────────────────────────────────────
        id,
        planTerritorialId,
        version,
        fechaGuardado,

        // ── Estado ─────────────────────────────────────────────────────────
        estado:    estadoNorm,
        esBorrador: estadoNorm === ESTADOS_PLAN_ACCION.BORRADOR,
        esGuardado: estadoNorm === ESTADOS_PLAN_ACCION.GUARDADO,
        esEditado:  estadoNorm === ESTADOS_PLAN_ACCION.EDITADO,

        // ── Nivel estratégico ──────────────────────────────────────────────
        //    objetivos: la selección EPVSA estructural (lo que el usuario eligió)
        //    acciones:  las actuaciones-tipo que componen el plan (el catálogo activado)
        //
        //    IMPORTANTE: 'acciones' aquí NO son instancias de dominio/accion.js.
        //    Son los registros del catálogo EPVSA que aparecen en el documento del plan.
        //    Las instancias de Accion (de agenda) referencian a este plan, no al revés.
        objetivos: Object.freeze([...(objetivos || [])]),
        acciones:  Object.freeze([...(acciones  || [])]),

        // ── Estadísticas derivadas ─────────────────────────────────────────
        tieneContenido,
        totalLineas,
        totalAcciones,

        // ── Separación explícita de niveles ───────────────────────────────
        //    nivelEstrategico: true — este objeto pertenece al nivel estratégico
        //    Las AgendaAnual y Accion pertenecen al nivel operativo.
        //    Esta propiedad existe para que futuras validaciones puedan verificar
        //    que no se está mezclando nivel estratégico con operativo.
        nivelEstrategico: true,

        // ── Metadata ───────────────────────────────────────────────────────
        metadatos: Object.freeze({ ...metadatos }),

        toString() {
            return `PlanAccion(${this.planTerritorialId} [${this.estado}] ${this.totalLineas} líneas, ${this.totalAcciones} actuaciones-tipo)`;
        },
        toJSON() {
            return {
                id, planTerritorialId, version, fechaGuardado, estado: estadoNorm,
                totalLineas, totalAcciones, tieneContenido,
                objetivos: [...(objetivos || [])],
                acciones:  [...(acciones  || [])],
            };
        },
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// BRIDGES DESDE FORMATO HEREDADO
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Crea un PlanAccion desde el objeto planAccion almacenado en Firebase.
 * Formato Firebase: { fechaISO, seleccionEPVSA, actuaciones, version }
 *
 * ⚠️ ACLARACIÓN DE TERMINOLOGÍA:
 *   En el monolito, 'actuaciones' son las actuaciones-tipo del catálogo EPVSA
 *   que el plan activa. NO son las instancias Accion de la agenda.
 *   En el modelo de dominio, las llamamos 'acciones' del plan (nivel estratégico)
 *   para distinguirlas de las 'Accion' de la agenda (dominio/accion.js).
 *
 * @param {string} planTerritorialId
 * @param {object} planFirebase       - { fechaISO, seleccionEPVSA, actuaciones, version }
 * @returns {Readonly<object>|null}
 */
export function planAccionDesdeFirebase(planTerritorialId, planFirebase) {
    if (!planFirebase || !planTerritorialId) return null;

    const tieneSel = Array.isArray(planFirebase.seleccionEPVSA) && planFirebase.seleccionEPVSA.length > 0;

    return crearPlanAccion({
        planTerritorialId,
        estado:       tieneSel ? ESTADOS_PLAN_ACCION.GUARDADO : ESTADOS_PLAN_ACCION.BORRADOR,
        version:      planFirebase.version     || 'auto',
        fechaGuardado: planFirebase.fechaISO   || null,
        // seleccionEPVSA → objetivos (nombre de dominio)
        objetivos:    planFirebase.seleccionEPVSA || [],
        // actuaciones heredadas → acciones del plan (actuaciones-tipo, nivel estratégico)
        acciones:     planFirebase.actuaciones  || [],
    });
}

/**
 * Crea un PlanAccion desde el estado operativo en memoria del monolito.
 * Fuente: window.COMPAS.state.planAccion
 *
 * @param {string} planTerritorialId
 * @param {object} planEnMemoria  - window.COMPAS.state.planAccion
 * @returns {Readonly<object>|null}
 */
export function planAccionDesdeMemoria(planTerritorialId, planEnMemoria) {
    if (!planEnMemoria || !planTerritorialId) return null;

    const tieneSel = Array.isArray(planEnMemoria.seleccion) && planEnMemoria.seleccion.length > 0;

    return crearPlanAccion({
        planTerritorialId,
        estado:       planEnMemoria.version === 'editado'
                        ? ESTADOS_PLAN_ACCION.EDITADO
                        : tieneSel
                            ? ESTADOS_PLAN_ACCION.GENERADO
                            : ESTADOS_PLAN_ACCION.BORRADOR,
        version:      planEnMemoria.version || 'auto',
        fechaGuardado: planEnMemoria.fecha  || null,
        objetivos:    planEnMemoria.seleccion || [],
        acciones:     [],   // el estado en memoria no siempre tiene las actuaciones normalizadas
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compara dos planes de acción por identidad de id.
 */
export function sonMismoPlanAccion(a, b) {
    if (!a || !b) return false;
    return a.id === b.id;
}

/**
 * Devuelve los códigos de línea estratégica activados en el plan.
 * @param {Readonly<object>} planAccion
 * @returns {string[]}
 */
export function getLineasActivas(planAccion) {
    if (!planAccion || !planAccion.objetivos) return [];
    return planAccion.objetivos.map(o => o.id || o.lineaId || '').filter(Boolean);
}

/**
 * Devuelve los códigos de programa activados en el plan (de todas las líneas).
 * @param {Readonly<object>} planAccion
 * @returns {string[]}
 */
export function getProgramasActivos(planAccion) {
    if (!planAccion || !planAccion.acciones) return [];
    const codigos = planAccion.acciones.map(a => a.programaCodigo || '').filter(Boolean);
    return [...new Set(codigos)]; // deduplicados
}
