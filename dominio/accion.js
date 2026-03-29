/**
 * COMPÁS — Entidad de dominio: Acción
 * dominio/accion.js
 *
 * ITERACIÓN 4 — Unidad atómica del nivel operativo.
 *
 * Una Acción es la unidad de implementación concreta del plan de salud.
 * Pertenece al nivel operativo (no al nivel estratégico).
 * Se programa en una AgendaAnual y se ejecuta en un contexto territorial.
 *
 * DISTINCIÓN CRÍTICA DE NIVELES:
 *   Nivel estratégico → PlanAccion (qué se decide hacer, selección EPVSA)
 *   Nivel operativo   → Accion (cómo, cuándo, quién lo implementa)
 *
 * ORIGEN DE LAS ACCIONES (regla de dominio explicitada):
 *   Las acciones pueden originarse de tres formas exclusivas:
 *   - generador_automatico: creada por sincronizarPlanConAgenda() al importar el plan
 *   - selector_epvsa:       creada desde trasladarActuacionAAgenda() (catálogo tipo EPVSA)
 *   - manual_agenda:        creada por el usuario directamente en el formulario de agenda
 *
 * ESTADO HEREDADO:
 *   En el monolito, las acciones viven en el array global `accionesAgenda` (HTML l.11563).
 *   El campo `origenAccion` NO existe en el formato heredado de Firebase.
 *   El bridge `accionDesdeHeredado()` infiere el origen desde heurísticas.
 *
 * MÓDULO PURO: Sin DOM. Sin Firebase. Sin efectos secundarios.
 */

// ─────────────────────────────────────────────────────────────────────────────
// ORÍGENES DE ACCIÓN
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Origenes posibles de una acción en la agenda.
 *
 * GENERADOR_AUTOMATICO:
 *   La acción fue creada automáticamente por sincronizarPlanConAgenda().
 *   Toma el plan EPVSA guardado y genera acciones para cada actuación seleccionada.
 *   Identificador heredado: descripcion contiene "incorporada desde el Plan local".
 *
 * SELECTOR_EPVSA:
 *   La acción fue creada por el técnico desde el catálogo tipo EPVSA
 *   (trasladarActuacionAAgenda). El técnico escoge una actuación tipo y la adapta.
 *   Identificador heredado: codigoEPVSA presente + no contiene la marca del generador.
 *
 * MANUAL_AGENDA:
 *   La acción fue creada libremente por el técnico desde el formulario de agenda,
 *   sin partir de ninguna actuación tipo EPVSA.
 *   Identificador heredado: sin codigoEPVSA o codigoEPVSA vacío.
 */
export const ORIGENES_ACCION = Object.freeze({
    GENERADOR_AUTOMATICO: 'generador_automatico',
    SELECTOR_EPVSA:       'selector_epvsa',
    MANUAL_AGENDA:        'manual_agenda',
});

const _ORIGENES_VALIDOS = new Set(Object.values(ORIGENES_ACCION));

// ─────────────────────────────────────────────────────────────────────────────
// ESTADOS DE LA ACCIÓN
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Estados posibles de una acción durante su ciclo de vida.
 * Compatible con los estados heredados del monolito (normalizarActuacion l.12186).
 */
export const ESTADOS_ACCION = Object.freeze({
    PLANIFICADA:  'planificada',
    EN_EJECUCION: 'en ejecucion',    // formato heredado con espacio (no guion)
    FINALIZADA:   'finalizada',
    SUSPENDIDA:   'suspendida',
});

const _ESTADOS_VALIDOS_ACCION = new Set(Object.values(ESTADOS_ACCION));

// ─────────────────────────────────────────────────────────────────────────────
// INFERENCIA DE ORIGEN (para datos heredados sin campo origenAccion)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Infiere el origen probable de una acción heredada que no tiene el campo
 * `origenAccion` explícito. Se aplica solo en el bridge de compatibilidad.
 *
 * Heurísticas (en orden de prioridad):
 *  1. descripción contiene "incorporada desde el Plan local" → generador_automatico
 *  2. codigoEPVSA presente y no vacío → selector_epvsa
 *  3. resto → manual_agenda
 *
 * @private
 */
function _inferirOrigen(act) {
    if (!act) return ORIGENES_ACCION.MANUAL_AGENDA;
    const desc = (act.descripcion || '').toLowerCase();
    if (desc.includes('incorporada desde el plan') || desc.includes('incorporada desde')) {
        return ORIGENES_ACCION.GENERADOR_AUTOMATICO;
    }
    if (act.codigoEPVSA && act.codigoEPVSA.trim() !== '') {
        return ORIGENES_ACCION.SELECTOR_EPVSA;
    }
    return ORIGENES_ACCION.MANUAL_AGENDA;
}

// ─────────────────────────────────────────────────────────────────────────────
// VALIDACIÓN
// ─────────────────────────────────────────────────────────────────────────────

function _validarAccion({ id, titulo }) {
    if (id === undefined || id === null) {
        throw new Error('[Accion] El campo "id" es obligatorio.');
    }
    if (!titulo || typeof titulo !== 'string' || titulo.trim() === '') {
        throw new Error(`[Accion] El campo "titulo" es obligatorio y no puede estar vacío. Recibido: ${JSON.stringify(titulo)}`);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// ENTIDAD: Accion
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Crea una entidad Accion inmutable.
 *
 * Estructura dividida en tres grupos semánticos:
 *   1. Identificación y trazabilidad (nivel estratégico)
 *   2. Planificación operativa (nivel agenda)
 *   3. Responsabilidad y medición
 *
 * @param {object}  datos
 *
 * IDENTIFICACIÓN:
 * @param {number|string} datos.id             - ID numérico (compatibilidad con monolito)
 * @param {string}  datos.titulo               - Nombre de la acción (campo 'nombre' en monolito)
 * @param {string}  [datos.descripcion]
 * @param {string}  [datos.origenAccion]        - Uno de ORIGENES_ACCION
 * @param {string}  [datos.planTerritorialId]   - Referencia al PlanTerritorial
 * @param {string}  [datos.agendaAnualId]       - Referencia a la AgendaAnual (opcional)
 * @param {string}  [datos.prioridadId]         - ID de prioridad temática si existe
 *
 * TRAZABILIDAD EPVSA (nivel estratégico):
 * @param {string}  [datos.codigoEPVSA]         - Código actuación-tipo ('P03-A01')
 * @param {string}  [datos.lineaEpvsa]          - ID de línea estratégica ('1', '2'...)
 * @param {string}  [datos.objetivoEPVSA]       - Descripción del objetivo
 * @param {string}  [datos.programa]            - Nombre del programa
 * @param {string}  [datos.estrategia]          - Alias de lineaEpvsa (campo heredado)
 *
 * PLANIFICACIÓN OPERATIVA:
 * @param {string}  [datos.entorno]             - 'sanitario'|'comunitario'|'educativo'|'laboral'
 * @param {string}  [datos.anio]                - Año de ejecución ('2026')
 * @param {string}  [datos.trimestre]           - 'T1'|'T2'|'T3'|'T4'
 * @param {string}  [datos.estado]              - Uno de ESTADOS_ACCION
 * @param {string}  [datos.prioridad]           - 'alta'|'media'|'baja'
 * @param {string}  [datos.fechaPrevista]
 * @param {string}  [datos.fechaReal]
 * @param {string}  [datos.observaciones]
 *
 * RESPONSABILIDAD:
 * @param {string}  [datos.responsable]
 * @param {string}  [datos.organizacion]
 * @param {string}  [datos.profesionales]
 * @param {string}  [datos.entidadResponsable]
 * @param {string}  [datos.personaReferente]
 * @param {string}  [datos.contacto]
 * @param {string}  [datos.poblacion]
 * @param {string}  [datos.etapaVida]
 *
 * MEDICIÓN:
 * @param {string}  [datos.indicadorPrincipal]
 * @param {Array}   [datos.indicadoresSecundarios]
 * @param {string}  [datos.meta]
 * @param {string}  [datos.frecuencia]
 * @param {string}  [datos.evidencia]
 * @param {string}  [datos.recursos]
 *
 * @param {object}  [datos.metadatos]           - Datos adicionales libres
 *
 * @returns {Readonly<object>} Entidad Accion inmutable
 */
export function crearAccion({
    id,
    titulo,
    descripcion             = '',
    origenAccion            = ORIGENES_ACCION.MANUAL_AGENDA,
    planTerritorialId       = null,
    agendaAnualId           = null,
    prioridadId             = null,

    // Trazabilidad EPVSA
    codigoEPVSA             = '',
    lineaEpvsa              = '',
    objetivoEPVSA           = '',
    programa                = '',
    estrategia              = '',

    // Planificación operativa
    entorno                 = 'comunitario',
    anio                    = '',
    trimestre               = '',
    estado                  = ESTADOS_ACCION.PLANIFICADA,
    prioridad               = 'media',
    fechaPrevista           = '',
    fechaReal               = '',
    observaciones           = '',

    // Responsabilidad
    responsable             = '',
    organizacion            = '',
    profesionales           = '',
    entidadResponsable      = '',
    personaReferente        = '',
    contacto                = '',
    poblacion               = '',
    etapaVida               = '',

    // Medición
    indicadorPrincipal      = '',
    indicadoresSecundarios  = [],
    meta                    = '',
    frecuencia              = '',
    evidencia               = '',
    recursos                = '',

    metadatos               = {},
} = {}) {
    _validarAccion({ id, titulo });

    const origenNorm = _ORIGENES_VALIDOS.has(origenAccion)
        ? origenAccion
        : ORIGENES_ACCION.MANUAL_AGENDA;

    const estadoNorm = _ESTADOS_VALIDOS_ACCION.has(estado)
        ? estado
        : ESTADOS_ACCION.PLANIFICADA;

    // estrategia es alias de lineaEpvsa en el monolito — normalizar
    const estrategiaNorm = estrategia || lineaEpvsa || '';

    return Object.freeze({
        // ── Identificación ─────────────────────────────────────────────────
        id,
        titulo,
        descripcion,
        origenAccion: origenNorm,
        planTerritorialId,
        agendaAnualId,
        prioridadId,

        // ── Trazabilidad EPVSA (nivel estratégico) ─────────────────────────
        codigoEPVSA,
        lineaEpvsa,
        objetivoEPVSA,
        programa,
        estrategia: estrategiaNorm,

        // ── Planificación operativa ────────────────────────────────────────
        entorno,
        anio,
        trimestre,
        estado:   estadoNorm,
        prioridad,
        fechaPrevista,
        fechaReal,
        observaciones,

        // ── Responsabilidad ────────────────────────────────────────────────
        responsable,
        organizacion,
        profesionales,
        entidadResponsable,
        personaReferente,
        contacto,
        poblacion,
        etapaVida,

        // ── Medición ───────────────────────────────────────────────────────
        indicadorPrincipal,
        indicadoresSecundarios: Object.freeze([...(indicadoresSecundarios || [])]),
        meta,
        frecuencia,
        evidencia,
        recursos,

        // ── Predicados de conveniencia ─────────────────────────────────────
        esPlanificada:  estadoNorm === ESTADOS_ACCION.PLANIFICADA,
        estaEnEjecucion: estadoNorm === ESTADOS_ACCION.EN_EJECUCION,
        estaFinalizada: estadoNorm === ESTADOS_ACCION.FINALIZADA,

        tieneCodigoEPVSA: !!(codigoEPVSA && codigoEPVSA.trim()),
        fueGeneradaAutomaticamente: origenNorm === ORIGENES_ACCION.GENERADOR_AUTOMATICO,
        fueSeleccionadaDeCatalogo:  origenNorm === ORIGENES_ACCION.SELECTOR_EPVSA,
        fueCreadadManualmente:      origenNorm === ORIGENES_ACCION.MANUAL_AGENDA,

        // ── Metadata ───────────────────────────────────────────────────────
        metadatos: Object.freeze({ ...metadatos }),

        toString() {
            return `Accion(${this.id} [${this.origenAccion}] "${this.titulo.slice(0, 40)}")`;
        },
        toJSON() {
            return {
                id, titulo, descripcion, origenAccion: origenNorm,
                planTerritorialId, agendaAnualId, prioridadId,
                codigoEPVSA, lineaEpvsa, objetivoEPVSA, programa,
                estrategia: estrategiaNorm,
                entorno, anio, trimestre, estado: estadoNorm, prioridad,
                fechaPrevista, fechaReal, observaciones,
                responsable, organizacion, profesionales,
                entidadResponsable, personaReferente, contacto,
                poblacion, etapaVida,
                indicadorPrincipal, indicadoresSecundarios: [...(indicadoresSecundarios || [])],
                meta, frecuencia, evidencia, recursos,
            };
        },
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// BRIDGE DESDE FORMATO HEREDADO
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Crea una entidad Accion desde el formato heredado del monolito.
 * El formato heredado es el objeto normalizado por normalizarActuacion() (l.12170).
 *
 * @param {object} act              - Objeto acción del array accionesAgenda
 * @param {string} [planTerritorialId]
 * @param {string} [agendaAnualId]
 * @returns {Readonly<object>|null}
 */
export function accionDesdeHeredado(act, planTerritorialId = null, agendaAnualId = null) {
    if (!act || typeof act !== 'object') return null;

    // Inferir origen si no está explícito (datos heredados de Firebase no tienen este campo)
    const origen = _ORIGENES_VALIDOS.has(act.origenAccion)
        ? act.origenAccion
        : _inferirOrigen(act);

    return crearAccion({
        id:                     act.id,
        titulo:                 act.nombre || act.actuacion || '(sin título)',
        descripcion:            act.descripcion          || '',
        origenAccion:           origen,
        planTerritorialId,
        agendaAnualId,
        prioridadId:            act.prioridadId          || null,

        codigoEPVSA:            act.codigoEPVSA          || '',
        lineaEpvsa:             act.lineaEpvsa           || act.estrategia || '',
        objetivoEPVSA:          act.objetivoEPVSA        || act.objetivo   || '',
        programa:               act.programa             || '',
        estrategia:             act.estrategia           || act.lineaEpvsa || '',

        entorno:                act.entorno              || 'comunitario',
        anio:                   act.anio                 || '',
        trimestre:              act.trimestre            || '',
        estado:                 act.estado               || ESTADOS_ACCION.PLANIFICADA,
        prioridad:              act.prioridad            || 'media',
        fechaPrevista:          act.fechaPrevista        || '',
        fechaReal:              act.fechaReal            || '',
        observaciones:          act.observaciones        || '',

        responsable:            act.responsable          || '',
        organizacion:           act.organizacion         || act.entidadResponsable || '',
        profesionales:          act.profesionales        || '',
        entidadResponsable:     act.entidadResponsable   || act.organizacion || '',
        personaReferente:       act.personaReferente     || '',
        contacto:               act.contacto             || '',
        poblacion:              act.poblacion            || act.colectivo   || '',
        etapaVida:              act.etapaVida            || '',

        indicadorPrincipal:     act.indicadorPrincipal   || act.indicador  || '',
        indicadoresSecundarios: Array.isArray(act.indicadoresSecundarios) ? act.indicadoresSecundarios : [],
        meta:                   act.meta                 || '',
        frecuencia:             act.frecuencia           || '',
        evidencia:              act.evidencia            || '',
        recursos:               act.recursos             || '',
    });
}

/**
 * Convierte un array de acciones heredadas a entidades Accion de dominio.
 * @param {Array}  accionesHeredadas
 * @param {string} [planTerritorialId]
 * @param {string} [agendaAnualId]
 * @returns {Readonly<object>[]}
 */
export function accionesDesdeHeredadas(accionesHeredadas, planTerritorialId = null, agendaAnualId = null) {
    if (!Array.isArray(accionesHeredadas)) return [];
    return accionesHeredadas
        .map(act => accionDesdeHeredado(act, planTerritorialId, agendaAnualId))
        .filter(Boolean);
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Convierte una entidad Accion de vuelta al formato plano compatible con
 * el array accionesAgenda del monolito. Para uso en bridges de escritura.
 *
 * ⚠️ PROVISIONAL: Mientras el monolito use accionesAgenda directamente,
 *    los cambios en entidades Accion deben propagarse al formato plano.
 *
 * @param {Readonly<object>} accion
 * @returns {object} Objeto plano compatible con normalizarActuacion()
 */
export function accionAHeredado(accion) {
    if (!accion) return null;
    return {
        id:                    accion.id,
        nombre:                accion.titulo,
        actuacion:             accion.titulo,
        descripcion:           accion.descripcion,
        origenAccion:          accion.origenAccion,  // campo nuevo, ignorado por monolito
        codigoEPVSA:           accion.codigoEPVSA,
        programa:              accion.programa,
        lineaEpvsa:            accion.lineaEpvsa,
        objetivoEPVSA:         accion.objetivoEPVSA,
        estrategia:            accion.estrategia,
        objetivo:              accion.objetivoEPVSA,
        entorno:               accion.entorno,
        anio:                  accion.anio,
        trimestre:             accion.trimestre,
        estado:                accion.estado,
        prioridad:             accion.prioridad,
        fechaPrevista:         accion.fechaPrevista,
        fechaReal:             accion.fechaReal,
        observaciones:         accion.observaciones,
        responsable:           accion.responsable,
        organizacion:          accion.organizacion,
        profesionales:         accion.profesionales,
        entidadResponsable:    accion.entidadResponsable,
        personaReferente:      accion.personaReferente,
        contacto:              accion.contacto,
        poblacion:             accion.poblacion,
        colectivo:             accion.poblacion,
        etapaVida:             accion.etapaVida,
        indicador:             accion.indicadorPrincipal,
        indicadorPrincipal:    accion.indicadorPrincipal,
        indicadoresSecundarios: accion.indicadoresSecundarios || [],
        meta:                  accion.meta,
        frecuencia:            accion.frecuencia,
        evidencia:             accion.evidencia,
        recursos:              accion.recursos,
    };
}

/**
 * Filtra acciones por año de ejecución.
 */
export function filtrarPorAnio(acciones, anio) {
    return (acciones || []).filter(a => String(a.anio) === String(anio));
}

/**
 * Filtra acciones por entorno.
 */
export function filtrarPorEntorno(acciones, entorno) {
    return (acciones || []).filter(a => a.entorno === entorno);
}

/**
 * Devuelve estadísticas de un array de acciones (equivalente modular de actuacion_proyectarEvaluacion).
 */
export function estadisticasAcciones(acciones) {
    const lista = acciones || [];
    const por = (campo) => lista.reduce((acc, a) => {
        const v = a[campo] || 'desconocido';
        acc[v] = (acc[v] || 0) + 1;
        return acc;
    }, {});
    return {
        total:        lista.length,
        porEstado:    por('estado'),
        porOrigen:    por('origenAccion'),
        porEntorno:   por('entorno'),
        porPrioridad: por('prioridad'),
        porAnio:      por('anio'),
    };
}
