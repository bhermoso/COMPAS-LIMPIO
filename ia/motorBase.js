/**
 * COMPÁS — Base común para motores IA
 * ia/motorBase.js
 *
 * ITERACIÓN 7 — Contrato base del subsistema IA.
 *
 * REGLA ARQUITECTURAL FUNDAMENTAL:
 *   "La IA es apoyo técnico, no decisora automática."
 *   Todo motor debe:
 *     1. Recibir un ContextoIA estructurado como entrada (nunca leer del DOM)
 *     2. Producir una SalidaMotor con estado de revisión humana
 *     3. Dejar trazabilidad de cada ejecución
 *     4. No modificar estado global directamente
 *
 * DISEÑO:
 *   `crearMotor(spec)` es una factory que construye objetos motor conformes
 *   al contrato. Los motores concretos (v2 salutogénico, v3 multicriterio,
 *   generador de propuesta, fusión) se crearán importando esta factory.
 *
 * ESTADO HEREDADO:
 *   Los motores actuales del monolito (analizarDatosMunicipio, ejecutarMotorExpertoCOMPAS,
 *   COMPAS_analizarV3, generarPropuestaIA) siguen intactos.
 *   Este módulo NO los reemplaza todavía; prepara el contrato para migrarlos.
 *
 * MÓDULO PURO: Sin DOM. Sin Firebase. Sin efectos secundarios directos.
 */

import { crearRegistroTrazabilidad, registrarEjecucion } from './trazabilidadIA.js';
import { validarContextoMinimo, validarSalida } from './validacionIA.js';

// ─────────────────────────────────────────────────────────────────────────────
// ESTADOS DE REVISIÓN HUMANA
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Estados posibles de la revisión humana de un resultado IA.
 *
 * PENDIENTE:  El motor ha ejecutado; el técnico aún no ha revisado el resultado.
 *             Este es el estado por defecto de TODA salida IA.
 *             Un resultado en estado PENDIENTE NO debe aplicarse automáticamente.
 *
 * REVISADO:   El técnico ha visto el resultado. Puede aceptarlo, modificarlo o rechazarlo.
 *
 * APROBADO:   El técnico ha confirmado que el resultado es correcto y quiere usarlo.
 *             Solo en este estado debería actualizarse el plan o la priorización.
 *
 * RECHAZADO:  El técnico ha descartado el resultado. Se conserva en el historial
 *             para trazabilidad pero no se aplica.
 *
 * PARCIAL:    El técnico ha aceptado parte del resultado y rechazado otra parte.
 */
export const ESTADOS_REVISION = Object.freeze({
    PENDIENTE:  'pendiente',
    REVISADO:   'revisado',
    APROBADO:   'aprobado',
    RECHAZADO:  'rechazado',
    PARCIAL:    'parcial',
});

// ─────────────────────────────────────────────────────────────────────────────
// GRADOS DE CONFIANZA
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Niveles semánticos de confianza de un resultado IA.
 * El motor calcula un valor numérico [0-1]; este mapa lo traduce a texto.
 */
export const GRADOS_CONFIANZA = Object.freeze({
    MUY_ALTO:  { min: 0.85, label: 'Muy alto',  descripcion: '5 fuentes convergentes' },
    ALTO:      { min: 0.65, label: 'Alto',       descripcion: '4 fuentes o 3 con alta convergencia' },
    MEDIO:     { min: 0.40, label: 'Medio',      descripcion: '2-3 fuentes disponibles' },
    BAJO:      { min: 0.20, label: 'Bajo',       descripcion: '1 fuente disponible' },
    MUY_BAJO:  { min: 0.00, label: 'Muy bajo',   descripcion: 'Datos insuficientes o incompletos' },
});

/**
 * Calcula el grado semántico de confianza desde un valor numérico [0-1].
 * @param {number} valor
 * @returns {object} Entrada de GRADOS_CONFIANZA
 */
export function getGradoConfianza(valor) {
    if (valor >= GRADOS_CONFIANZA.MUY_ALTO.min) return GRADOS_CONFIANZA.MUY_ALTO;
    if (valor >= GRADOS_CONFIANZA.ALTO.min)      return GRADOS_CONFIANZA.ALTO;
    if (valor >= GRADOS_CONFIANZA.MEDIO.min)     return GRADOS_CONFIANZA.MEDIO;
    if (valor >= GRADOS_CONFIANZA.BAJO.min)      return GRADOS_CONFIANZA.BAJO;
    return GRADOS_CONFIANZA.MUY_BAJO;
}

// ─────────────────────────────────────────────────────────────────────────────
// CONTRATO DE SALIDA DEL MOTOR
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Normaliza la salida de cualquier motor al formato canónico.
 * Garantiza que toda salida IA tiene los campos de contrato, independientemente
 * de la implementación interna del motor.
 *
 * @param {object} resultado     - Resultado crudo producido por la función ejecutar()
 * @param {object} traza         - Registro de trazabilidad de esta ejecución
 * @returns {Readonly<object>}   SalidaMotor normalizada
 */
export function normalizarSalidaMotor(resultado, traza) {
    const datos = (resultado && resultado.datos !== undefined) ? resultado.datos : resultado;
    const advertencias = (resultado && resultado.advertencias) ? resultado.advertencias : [];
    const error = (resultado && resultado.error) ? resultado.error : null;

    return Object.freeze({
        // ── Metadatos de la ejecución ──────────────────────────────────────
        motorId:               traza.motorId,
        motorVersion:          traza.motorVersion,
        fechaGeneracion:       traza.fechaGeneracion,
        duracionMs:            traza.duracionMs,

        // ── Estado de revisión humana ──────────────────────────────────────
        //    SIEMPRE empieza en PENDIENTE. El técnico debe aprobar antes de aplicar.
        estadoRevisionHumana:  ESTADOS_REVISION.PENDIENTE,

        // ── Confianza ──────────────────────────────────────────────────────
        gradoConfianza:        traza.gradoConfianza,
        gradoConfianzaLabel:   getGradoConfianza(traza.gradoConfianza || 0).label,
        fuentesUsadas:         traza.fuentesUsadas || [],

        // ── Contenido del resultado ────────────────────────────────────────
        datos,
        advertencias,
        error,
        sinDatos:              !!(resultado && resultado.sinDatos),

        // ── Trazabilidad (referencia) ──────────────────────────────────────
        trazabilidadId:        traza.id,

        toString() {
            return `SalidaMotor(${this.motorId} v${this.motorVersion} [${this.estadoRevisionHumana}] conf=${this.gradoConfianzaLabel})`;
        },
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// FACTORY DE MOTORES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Crea un motor IA conforme al contrato base de COMPÁS.
 *
 * El motor creado tiene la interfaz mínima obligatoria:
 *   - `motor.ejecutar(contextoIA)` → Promise<SalidaMotor>
 *   - `motor.validarContexto(ctx)` → { valido, errores, advertencias }
 *   - `motor.id`, `motor.version`, `motor.descripcion`
 *
 * @param {object} spec
 * @param {string}   spec.id           - Identificador único del motor ('motor_v2_salutogenico')
 * @param {string}   spec.version      - Versión semántica ('2.0', '3.1', etc.)
 * @param {string}   [spec.descripcion] - Descripción del motor para documentación
 * @param {Function} spec.ejecutarFn   - (contextoIA) → Promise<any>|any
 *                                       El resultado puede ser cualquier estructura;
 *                                       será normalizado por normalizarSalidaMotor().
 * @param {Function} [spec.validarFn]  - (contextoIA) → { valido, errores[], advertencias[] }
 *                                       Si no se provee, usa validarContextoMinimo() por defecto.
 * @param {Function} [spec.calcularConfianzaFn] - (resultado, contexto) → number [0-1]
 *                                                Si no se provee, usa heurística de fuentes.
 *
 * @returns {object} Motor IA con interfaz normalizada
 */
export function crearMotor({
    id,
    version,
    descripcion  = '',
    ejecutarFn,
    validarFn,
    calcularConfianzaFn,
} = {}) {
    if (!id)        throw new Error('[motorBase] spec.id es obligatorio.');
    if (!version)   throw new Error('[motorBase] spec.version es obligatorio.');
    if (!ejecutarFn || typeof ejecutarFn !== 'function') {
        throw new Error('[motorBase] spec.ejecutarFn es obligatorio y debe ser una función.');
    }

    const _validar = typeof validarFn === 'function' ? validarFn : validarContextoMinimo;

    const _calcularConfianza = typeof calcularConfianzaFn === 'function'
        ? calcularConfianzaFn
        : _heuristicaConfianzaPorFuentes;

    return Object.freeze({
        // ── Identidad ──────────────────────────────────────────────────────
        id,
        version,
        descripcion,

        // ── Interfaz pública ───────────────────────────────────────────────

        /**
         * Valida el contexto IA antes de ejecutar.
         * @param {object} contextoIA
         * @returns {{ valido: boolean, errores: string[], advertencias: string[] }}
         */
        validarContexto(contextoIA) {
            return _validar(contextoIA, id);
        },

        /**
         * Ejecuta el motor con el contexto dado.
         * Siempre devuelve una SalidaMotor normalizada, incluso si hay error.
         *
         * @param {object} contextoIA   - Objeto ContextoIA de ia/contextoIA.js
         * @returns {Promise<Readonly<object>>} SalidaMotor
         */
        async ejecutar(contextoIA) {
            const inicio = Date.now();

            // 1. Validar contexto
            const validacion = _validar(contextoIA, id);
            if (!validacion.valido) {
                const traza = crearRegistroTrazabilidad({
                    motorId: id, motorVersion: version,
                    ambitoId: contextoIA?.ambitoId || 'desconocido',
                    fuentesUsadas: [],
                    gradoConfianza: 0,
                    duracionMs: Date.now() - inicio,
                    error: `Contexto inválido: ${validacion.errores.join('; ')}`,
                    resumenEntrada: _resumirContexto(contextoIA),
                    resumenSalida: null,
                });
                registrarEjecucion(traza);
                return normalizarSalidaMotor(
                    { error: `Contexto inválido: ${validacion.errores.join('; ')}`, sinDatos: true },
                    traza
                );
            }

            // 2. Ejecutar el motor (el resultado puede ser síncrono o async)
            let resultado = null;
            let errorCapturado = null;
            try {
                resultado = await Promise.resolve(ejecutarFn(contextoIA));
            } catch (e) {
                errorCapturado = e.message || String(e);
                console.error(`[${id} v${version}] Error de ejecución:`, e);
            }

            // 3. Calcular confianza
            const gradoConfianza = errorCapturado
                ? 0
                : _calcularConfianza(resultado, contextoIA);

            // 4. Construir trazabilidad
            const traza = crearRegistroTrazabilidad({
                motorId:       id,
                motorVersion:  version,
                ambitoId:      contextoIA.ambitoId || 'desconocido',
                fuentesUsadas: _extraerFuentesUsadas(contextoIA),
                gradoConfianza,
                duracionMs:    Date.now() - inicio,
                error:         errorCapturado,
                resumenEntrada: _resumirContexto(contextoIA),
                resumenSalida:  _resumirResultado(resultado),
            });
            registrarEjecucion(traza);

            // 5. Validar salida (advertencia si la estructura es inusual)
            const validacionSalida = validarSalida(resultado, id);
            const advertencias = [
                ...validacion.advertencias,
                ...validacionSalida.advertencias,
            ];
            if (errorCapturado) {
                advertencias.unshift(`Error en ejecución: ${errorCapturado}`);
            }

            // 6. Normalizar y devolver
            return normalizarSalidaMotor(
                {
                    datos:       errorCapturado ? null : resultado,
                    advertencias,
                    error:       errorCapturado,
                    sinDatos:    !!(resultado && resultado.sinDatos) || !!errorCapturado,
                },
                traza
            );
        },

        toString() {
            return `Motor(${id} v${version})`;
        },
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS INTERNOS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Heurística de confianza basada en el número de fuentes disponibles en el contexto.
 * Formaliza la lógica implícita que tienen los motores v2 y v3.
 * @private
 */
function _heuristicaConfianzaPorFuentes(resultado, contextoIA) {
    if (!contextoIA || !contextoIA.fuentes) return 0.10;
    const f = contextoIA.fuentes;
    const nFuentes = [
        f.tieneInforme, f.tieneEstudios, f.tienePopular,
        f.tieneDet, f.tieneIndicadores
    ].filter(Boolean).length;

    // Base: 0.20 por fuente, hasta 1.0
    // Bonus si hay resultado con priorizacion o propuesta
    let base = Math.min(0.95, nFuentes * 0.18);
    if (resultado && resultado.priorizacion && resultado.priorizacion.length >= 3) base = Math.min(0.95, base + 0.10);
    if (resultado && resultado.sinDatos) base = 0.00;
    return parseFloat(base.toFixed(2));
}

/**
 * Extrae las fuentes usadas del contexto para registrar en trazabilidad.
 * @private
 */
function _extraerFuentesUsadas(contextoIA) {
    if (!contextoIA) return [];
    const f = contextoIA.fuentes || {};
    const fuentes = [];
    if (f.tieneInforme)    fuentes.push('Informe de situación de salud');
    if (f.tieneEstudios)   fuentes.push(`Estudios complementarios (${f.nEstudios || '?'})`);
    if (f.tienePopular)    fuentes.push(`Priorización popular (${f.nParticipantes || '?'} participantes)`);
    if (f.tieneDet)        fuentes.push('Determinantes EAS');
    if (f.tieneIndicadores) fuentes.push('Cuadro de mandos integral (50 indicadores)');
    return fuentes;
}

/**
 * Resumen compacto del contexto para trazabilidad (sin datos sensibles completos).
 * @private
 */
function _resumirContexto(ctx) {
    if (!ctx) return null;
    return {
        ambitoId:    ctx.ambitoId  || null,
        estrategia:  ctx.estrategia || null,
        fuentes:     ctx.fuentes   || {},
        timestamp:   ctx.timestamp || null,
    };
}

/**
 * Resumen compacto del resultado para trazabilidad.
 * @private
 */
function _resumirResultado(resultado) {
    if (!resultado) return null;
    if (resultado.sinDatos) return { sinDatos: true };
    return {
        tienePriorizacion: !!(resultado.priorizacion && resultado.priorizacion.length),
        nAreas:            resultado.priorizacion ? resultado.priorizacion.length : 0,
        tienePropuesta:    !!(resultado.propuestaEPVSA && resultado.propuestaEPVSA.length),
        tieneAlertas:      !!(resultado.alertasInequidad && resultado.alertasInequidad.length),
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// BRIDGE CON SISTEMA HEREDADO
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Envuelve un resultado heredado (window.analisisActual o analisisActualV3) en
 * una SalidaMotor normalizada, para que el código nuevo pueda tratarlo igual
 * que una salida de motor modular.
 *
 * ⚠️ PROVISIONAL: Este bridge permite que el código modular consuma resultados
 *    de los motores heredados sin migrarlos todavía.
 *    Estado de revisión humana: REVISADO (el monolito ya aplicó el resultado).
 *
 * @param {object|null} analisisHeredado   - window.analisisActual o window.analisisActualV3
 * @param {string} motorId                 - 'motor_v2_salutogenico' | 'motor_v3_multicriterio'
 * @param {string} version
 * @returns {Readonly<object>|null}
 */
export function salidaDesdeAnalisisHeredado(analisisHeredado, motorId, version) {
    if (!analisisHeredado) return null;

    const fuentes = [];
    const f = analisisHeredado.fuentes || {};
    if (f.tieneInforme)    fuentes.push('Informe de situación de salud');
    if (f.tieneEstudios)   fuentes.push('Estudios complementarios');
    if (f.tienePopular)    fuentes.push('Priorización popular');
    if (f.tieneDet)        fuentes.push('Determinantes EAS');
    if (f.tieneIndicadores) fuentes.push('Cuadro de mandos integral');

    const traza = crearRegistroTrazabilidad({
        motorId,
        motorVersion:  version,
        ambitoId:      analisisHeredado.municipio || 'heredado',
        fuentesUsadas: fuentes,
        gradoConfianza: _heuristicaConfianzaPorFuentes(analisisHeredado, { fuentes: f }),
        duracionMs:    0,
        error:         null,
        resumenEntrada: { fuentes: f },
        resumenSalida:  _resumirResultado(analisisHeredado),
        heredado:      true,
    });

    registrarEjecucion(traza);

    return Object.freeze({
        ...normalizarSalidaMotor({ datos: analisisHeredado }, traza),
        // Los resultados heredados ya los aplicó el monolito → estado REVISADO
        estadoRevisionHumana: ESTADOS_REVISION.REVISADO,
    });
}
