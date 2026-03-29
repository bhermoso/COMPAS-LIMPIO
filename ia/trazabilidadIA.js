/**
 * COMPÁS — Trazabilidad de ejecuciones IA
 * ia/trazabilidadIA.js
 *
 * ITERACIÓN 7 — Registro de trazabilidad para motores IA.
 *
 * PROPÓSITO:
 *   Todo resultado de un motor IA debe poder ser auditado:
 *   qué motor lo produjo, con qué datos, con qué confianza y si fue revisado.
 *   Este módulo mantiene un historial de sesión y puede persistir trazas
 *   en Firebase cuando el sistema lo requiera.
 *
 * ESTRUCTURA MÍNIMA DE UNA TRAZA:
 *   - motorId + motorVersion: qué motor corrió
 *   - fuentesUsadas: con qué datos
 *   - gradoConfianza: cuánta confianza tiene el resultado
 *   - fechaGeneracion: cuándo
 *   - estadoRevisionHumana: si el técnico revisó el resultado
 *   - resumenEntrada + resumenSalida: qué entró y qué salió (compacto)
 *
 * MÓDULO PURO: Sin DOM. Sin Firebase directa. Sin efectos en globals (salvo el bridge).
 */

// ─────────────────────────────────────────────────────────────────────────────
// ESTADOS DE REVISIÓN HUMANA (importados de motorBase para consistencia)
// Re-exportados aquí para que trazabilidadIA sea auto-contenido.
// ─────────────────────────────────────────────────────────────────────────────

export const ESTADOS_REVISION_TRAZA = Object.freeze({
    PENDIENTE:  'pendiente',
    REVISADO:   'revisado',
    APROBADO:   'aprobado',
    RECHAZADO:  'rechazado',
    PARCIAL:    'parcial',
});

// ─────────────────────────────────────────────────────────────────────────────
// HISTORIAL DE SESIÓN (en memoria)
// ─────────────────────────────────────────────────────────────────────────────

/** Historial de todas las ejecuciones IA en la sesión actual. */
const _historial = [];

/** Contador global para IDs únicos de trazas. */
let _contadorId = 0;

// ─────────────────────────────────────────────────────────────────────────────
// CREACIÓN DE REGISTROS DE TRAZABILIDAD
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Crea un registro de trazabilidad inmutable para una ejecución IA.
 *
 * @param {object} datos
 * @param {string}  datos.motorId              - ID del motor ('motor_v2_salutogenico', etc.)
 * @param {string}  datos.motorVersion         - Versión del motor ('2.0', '3.0', etc.)
 * @param {string}  datos.ambitoId             - Territorio que se analizó
 * @param {string[]} [datos.fuentesUsadas]     - Lista de fuentes de datos empleadas
 * @param {number}  [datos.gradoConfianza]     - 0-1 (calculado por el motor)
 * @param {string}  [datos.fechaGeneracion]    - ISO datetime (auto si no se da)
 * @param {number}  [datos.duracionMs]         - Duración de la ejecución en ms
 * @param {string|null} [datos.error]          - Mensaje de error si hubo fallo
 * @param {object|null} [datos.resumenEntrada] - Resumen compacto de la entrada
 * @param {object|null} [datos.resumenSalida]  - Resumen compacto de la salida
 * @param {boolean} [datos.heredado]           - true si es resultado de motor heredado
 * @param {object}  [datos.metadatos]          - Datos adicionales libres
 *
 * @returns {Readonly<object>} Registro de trazabilidad inmutable
 */
export function crearRegistroTrazabilidad({
    motorId,
    motorVersion,
    ambitoId,
    fuentesUsadas          = [],
    gradoConfianza         = 0,
    fechaGeneracion        = null,
    duracionMs             = 0,
    error                  = null,
    resumenEntrada         = null,
    resumenSalida          = null,
    heredado               = false,
    estadoRevisionHumana   = ESTADOS_REVISION_TRAZA.PENDIENTE,
    metadatos              = {},
} = {}) {
    if (!motorId)   throw new Error('[trazabilidadIA] motorId es obligatorio.');
    if (!ambitoId)  throw new Error('[trazabilidadIA] ambitoId es obligatorio.');

    _contadorId++;
    const id = `traza_${motorId}_${ambitoId}_${_contadorId}`;

    return Object.freeze({
        // ── Identificación ─────────────────────────────────────────────────
        id,
        motorId,
        motorVersion:         motorVersion || 'desconocida',
        ambitoId,

        // ── Temporal ───────────────────────────────────────────────────────
        fechaGeneracion:      fechaGeneracion || new Date().toISOString(),
        duracionMs:           duracionMs || 0,

        // ── Fuentes y confianza ────────────────────────────────────────────
        fuentesUsadas:        Object.freeze([...(fuentesUsadas || [])]),
        gradoConfianza:       Math.max(0, Math.min(1, gradoConfianza || 0)),
        nFuentesUsadas:       (fuentesUsadas || []).length,

        // ── Estado de revisión humana ──────────────────────────────────────
        //    PENDIENTE por defecto: ningún resultado se aplica sin revisión.
        estadoRevisionHumana,

        // ── Resúmenes ──────────────────────────────────────────────────────
        resumenEntrada:       resumenEntrada  ? Object.freeze({ ...resumenEntrada })  : null,
        resumenSalida:        resumenSalida   ? Object.freeze({ ...resumenSalida })   : null,

        // ── Estado ─────────────────────────────────────────────────────────
        error:                error || null,
        tuvoError:            !!error,
        heredado,             // true = resultado de motor heredado, no del módulo modular

        // ── Metadata ───────────────────────────────────────────────────────
        metadatos:            Object.freeze({ ...metadatos }),

        toString() {
            return `Traza(${this.motorId} v${this.motorVersion} [${this.estadoRevisionHumana}] ${this.ambitoId} conf=${this.gradoConfianza.toFixed(2)})`;
        },
        toJSON() {
            return {
                id, motorId, motorVersion: this.motorVersion, ambitoId,
                fechaGeneracion: this.fechaGeneracion, duracionMs,
                fuentesUsadas: [...(fuentesUsadas || [])],
                gradoConfianza: this.gradoConfianza,
                estadoRevisionHumana, error, heredado,
                resumenEntrada, resumenSalida,
            };
        },
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// REGISTRO DE EJECUCIONES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Registra una traza en el historial de sesión y la expone en window.COMPAS.
 * @param {Readonly<object>} traza - Creada con crearRegistroTrazabilidad()
 */
export function registrarEjecucion(traza) {
    if (!traza || !traza.id) return;
    _historial.push(traza);

    // Bridge: exponer en window.COMPAS para acceso desde código heredado
    if (typeof window !== 'undefined' && window.COMPAS) {
        if (!window.COMPAS.__trazabilidadIA) {
            window.COMPAS.__trazabilidadIA = { historial: _historial, registrar: registrarEjecucion };
        }
    }
}

/**
 * Actualiza el estado de revisión de una traza existente.
 * Crea una nueva traza (las trazas son inmutables) con el estado actualizado.
 *
 * @param {string} trazaId                 - ID de la traza a actualizar
 * @param {string} nuevoEstado             - Valor de ESTADOS_REVISION_TRAZA
 * @param {string} [notaRevision]          - Nota opcional del técnico revisor
 * @returns {Readonly<object>|null}        - Nueva traza con el estado actualizado
 */
export function actualizarRevision(trazaId, nuevoEstado, notaRevision = '') {
    const idx = _historial.findIndex(t => t.id === trazaId);
    if (idx === -1) return null;

    const original = _historial[idx];
    const actualizada = crearRegistroTrazabilidad({
        ...original.toJSON(),
        estadoRevisionHumana: nuevoEstado,
        metadatos: {
            ...original.metadatos,
            notaRevision,
            fechaRevision: new Date().toISOString(),
            trazaOriginalId: trazaId,
        },
    });

    // Reemplazar en el historial
    _historial[idx] = actualizada;
    return actualizada;
}

// ─────────────────────────────────────────────────────────────────────────────
// CONSULTAS DEL HISTORIAL
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Devuelve todo el historial de trazas de la sesión actual.
 * @returns {Readonly<object>[]}
 */
export function obtenerHistorial() {
    return [..._historial];
}

/**
 * Devuelve las trazas de un motor específico.
 * @param {string} motorId
 * @returns {Readonly<object>[]}
 */
export function obtenerTrazasPorMotor(motorId) {
    return _historial.filter(t => t.motorId === motorId);
}

/**
 * Devuelve las trazas para un ámbito específico.
 * @param {string} ambitoId
 * @returns {Readonly<object>[]}
 */
export function obtenerTrazasPorAmbito(ambitoId) {
    return _historial.filter(t => t.ambitoId === ambitoId);
}

/**
 * Devuelve las trazas pendientes de revisión.
 * @returns {Readonly<object>[]}
 */
export function obtenerPendientesRevision() {
    return _historial.filter(t => t.estadoRevisionHumana === ESTADOS_REVISION_TRAZA.PENDIENTE);
}

/**
 * Resumen estadístico del historial de sesión.
 * @returns {object}
 */
export function resumenHistorial() {
    const total = _historial.length;
    const porEstado = _historial.reduce((acc, t) => {
        acc[t.estadoRevisionHumana] = (acc[t.estadoRevisionHumana] || 0) + 1;
        return acc;
    }, {});
    const porMotor = _historial.reduce((acc, t) => {
        acc[t.motorId] = (acc[t.motorId] || 0) + 1;
        return acc;
    }, {});
    const conError = _historial.filter(t => t.tuvoError).length;

    return { total, porEstado, porMotor, conError, pendientes: porEstado.pendiente || 0 };
}

/**
 * Limpia el historial de sesión.
 * ⚠️ Usar solo en tests o al cambiar de territorio.
 */
export function limpiarHistorial() {
    _historial.length = 0;
    _contadorId = 0;
}
