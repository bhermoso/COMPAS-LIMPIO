/**
 * COMPÁS — Validación de entradas/salidas IA
 * ia/validacionIA.js
 *
 * ITERACIÓN 7 — Guardas de seguridad para el subsistema IA.
 *
 * PROPÓSITO:
 *   Evitar que un motor IA se ejecute con datos insuficientes o incorrectos,
 *   y verificar que la salida tiene la estructura esperada.
 *
 *   La validación NO es un filtro binario: puede emitir advertencias sin
 *   bloquear la ejecución. Solo bloquea cuando el contexto es inválido
 *   (sin ninguna fuente de datos o sin ámbito activo).
 *
 * MÓDULO PURO: Sin DOM. Sin Firebase. Sin efectos secundarios.
 */

// ─────────────────────────────────────────────────────────────────────────────
// RESULTADO DE VALIDACIÓN
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Crea un resultado de validación estándar.
 * @param {boolean} valido
 * @param {string[]} errores
 * @param {string[]} advertencias
 * @returns {{ valido: boolean, errores: string[], advertencias: string[] }}
 */
export function crearResultadoValidacion(valido, errores = [], advertencias = []) {
    return Object.freeze({ valido, errores: [...errores], advertencias: [...advertencias] });
}

// ─────────────────────────────────────────────────────────────────────────────
// VALIDACIONES DE CONTEXTO DE ENTRADA
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validación mínima del ContextoIA.
 * Se usa como validador por defecto cuando el motor no provee uno propio.
 *
 * BLOQUEA SI:
 *   - No hay ambitoId
 *   - No hay ninguna fuente de datos disponible
 *
 * ADVIERTE SI:
 *   - Faltan fuentes recomendadas (pero no todas)
 *   - El cuadro de mandos no tiene datos
 *   - La participación ciudadana no está disponible
 *
 * @param {object} contextoIA  - Objeto ContextoIA de ia/contextoIA.js
 * @param {string} [motorId]   - ID del motor que valida (para mensajes)
 * @returns {{ valido: boolean, errores: string[], advertencias: string[] }}
 */
export function validarContextoMinimo(contextoIA, motorId = 'motor') {
    const errores = [];
    const advertencias = [];

    // Error crítico: sin contexto
    if (!contextoIA || typeof contextoIA !== 'object') {
        return crearResultadoValidacion(false, ['Contexto IA nulo o inválido.'], []);
    }

    // Error crítico: sin ámbito identificado
    if (!contextoIA.ambitoId || contextoIA.ambitoId.trim() === '') {
        errores.push('No hay ámbito territorial activo. Seleccione un municipio antes de ejecutar el análisis.');
    }

    // Error crítico: sin ninguna fuente de datos
    const f = contextoIA.fuentes || {};
    const nFuentes = [f.tieneInforme, f.tieneEstudios, f.tienePopular, f.tieneDet, f.tieneIndicadores].filter(Boolean).length;
    if (nFuentes === 0) {
        errores.push(
            'No hay ninguna fuente de datos disponible para el análisis. ' +
            'Cargue al menos el Informe de Situación de Salud o los Determinantes EAS.'
        );
    }

    // Advertencias (no bloquean)
    if (nFuentes === 1) {
        advertencias.push(
            'Solo hay 1 fuente de datos disponible. Los resultados tendrán baja confianza. ' +
            'Se recomienda cargar al menos 2-3 fuentes para un análisis más robusto.'
        );
    }
    if (!f.tieneDet && nFuentes > 0) {
        advertencias.push('Sin determinantes EAS. El análisis epidemiológico será menos preciso.');
    }
    if (!f.tienePopular && nFuentes > 0) {
        advertencias.push('Sin participación ciudadana. La propuesta no incluirá perspectiva comunitaria.');
    }
    if (!f.tieneIndicadores && nFuentes > 0) {
        advertencias.push('Sin indicadores del Cuadro de Mandos Integral. El componente CI no estará disponible.');
    }

    return crearResultadoValidacion(errores.length === 0, errores, advertencias);
}

/**
 * Validación estricta: exige al menos informe + determinantes.
 * Para motores que requieren contexto analítico completo (motor v2, v3).
 *
 * @param {object} contextoIA
 * @param {string} [motorId]
 * @returns {{ valido: boolean, errores: string[], advertencias: string[] }}
 */
export function validarContextoAnalitico(contextoIA, motorId = 'motor') {
    // Primero la validación mínima
    const minima = validarContextoMinimo(contextoIA, motorId);
    if (!minima.valido) return minima;

    const errores   = [];
    const advertencias = [...minima.advertencias];
    const f = contextoIA.fuentes || {};

    // Para análisis completo: se recomienda al menos informe O determinantes
    if (!f.tieneInforme && !f.tieneDet) {
        errores.push(
            'El análisis salutogénico requiere al menos el Informe de Situación de Salud ' +
            'o los Determinantes EAS. Ninguno de los dos está disponible.'
        );
    }

    return crearResultadoValidacion(errores.length === 0, errores, advertencias);
}

/**
 * Validación para el motor de propuesta: exige análisis previo.
 * El motor generador de propuesta necesita que ya exista `window.analisisActual`
 * o que el contexto incluya el análisis como campo.
 *
 * @param {object} contextoIA
 * @param {string} [motorId]
 * @returns {{ valido: boolean, errores: string[], advertencias: string[] }}
 */
export function validarContextoPropuesta(contextoIA, motorId = 'motor_propuesta') {
    const minima = validarContextoMinimo(contextoIA, motorId);
    if (!minima.valido) return minima;

    const errores = [];
    const advertencias = [...minima.advertencias];

    const tieneAnalisis = contextoIA.analisisPrevio &&
        contextoIA.analisisPrevio.priorizacion &&
        contextoIA.analisisPrevio.priorizacion.length > 0;

    if (!tieneAnalisis) {
        errores.push(
            'El motor de propuesta requiere un análisis previo con áreas priorizadas. ' +
            'Ejecute primero el análisis salutogénico.'
        );
    }

    return crearResultadoValidacion(errores.length === 0, errores, advertencias);
}

// ─────────────────────────────────────────────────────────────────────────────
// VALIDACIONES DE SALIDA DEL MOTOR
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Valida que la salida de un motor tiene la estructura mínima esperada.
 * No lanza errores; emite advertencias si la estructura es inusual.
 *
 * @param {*} resultado       - Resultado crudo producido por ejecutarFn()
 * @param {string} motorId
 * @returns {{ valido: boolean, errores: string[], advertencias: string[] }}
 */
export function validarSalida(resultado, motorId = 'motor') {
    const advertencias = [];

    if (resultado === null || resultado === undefined) {
        return crearResultadoValidacion(false, [`[${motorId}] El motor devolvió null/undefined.`], []);
    }

    if (typeof resultado !== 'object') {
        return crearResultadoValidacion(
            false,
            [`[${motorId}] Se esperaba un objeto como salida; se recibió ${typeof resultado}.`],
            []
        );
    }

    if (resultado.sinDatos === true) {
        advertencias.push(`[${motorId}] El motor indicó sinDatos=true. El resultado no contiene análisis.`);
        return crearResultadoValidacion(true, [], advertencias);
    }

    // Advertencias si faltan campos esperados en análisis (no bloqueantes)
    if (!resultado.priorizacion && !resultado.propuestaEPVSA && !resultado.areaScores) {
        advertencias.push(
            `[${motorId}] El resultado no contiene priorizacion, propuestaEPVSA ni areaScores. ` +
            'Verificar si el motor produjo un resultado incompleto.'
        );
    }

    return crearResultadoValidacion(true, [], advertencias);
}

// ─────────────────────────────────────────────────────────────────────────────
// DIAGNÓSTICO DE CONTEXTO
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Genera un diagnóstico detallado de un ContextoIA sin ejecutar ningún motor.
 * Útil para mostrar al técnico qué datos faltan antes de lanzar el análisis.
 *
 * @param {object} contextoIA
 * @returns {object} Diagnóstico con estado de cada fuente
 */
export function diagnosticoContexto(contextoIA) {
    if (!contextoIA) {
        return { disponible: false, mensaje: 'Sin contexto IA.' };
    }

    const f = contextoIA.fuentes || {};
    const fuentes = [
        { id: 'informe',      label: 'Informe de situación',     disponible: !!f.tieneInforme,    importancia: 'alta' },
        { id: 'determinantes', label: 'Determinantes EAS',        disponible: !!f.tieneDet,        importancia: 'alta' },
        { id: 'popular',      label: 'Participación ciudadana',  disponible: !!f.tienePopular,    importancia: 'media' },
        { id: 'estudios',     label: 'Estudios complementarios', disponible: !!f.tieneEstudios,   importancia: 'media' },
        { id: 'indicadores',  label: 'Cuadro de mandos (50 ind)', disponible: !!f.tieneIndicadores, importancia: 'media' },
    ];

    const nDisponibles = fuentes.filter(f => f.disponible).length;
    const nAlta        = fuentes.filter(f => f.importancia === 'alta' && f.disponible).length;
    const nTotal       = fuentes.length;

    let nivelAnalisis;
    if (nDisponibles === 0)     nivelAnalisis = 'sin_datos';
    else if (nDisponibles === 1) nivelAnalisis = 'basico';
    else if (nDisponibles <= 3)  nivelAnalisis = 'intermedio';
    else                         nivelAnalisis = 'completo';

    const validacion = validarContextoMinimo(contextoIA);

    return {
        disponible:       nDisponibles > 0,
        ambitoId:         contextoIA.ambitoId,
        ambitoNombre:     contextoIA.ambitoNombre || contextoIA.ambitoId,
        nivelAnalisis,
        nFuentesDisponibles: nDisponibles,
        nFuentesTotal:    nTotal,
        nFuentesAltaImportancia: nAlta,
        fuentes,
        validacion,
        puedeEjecutar:    validacion.valido,
        advertencias:     validacion.advertencias,
        errores:          validacion.errores,
    };
}

/**
 * ¿El contexto tiene al menos una fuente de datos disponible?
 * Helper rápido para guards.
 */
export function contextoTieneAlMenosFuente(contextoIA) {
    if (!contextoIA || !contextoIA.fuentes) return false;
    const f = contextoIA.fuentes;
    return f.tieneInforme || f.tieneEstudios || f.tienePopular || f.tieneDet || f.tieneIndicadores;
}

/**
 * ¿El contexto tiene ámbito activo?
 */
export function contextoTieneAmbito(contextoIA) {
    return !!(contextoIA && contextoIA.ambitoId && contextoIA.ambitoId.trim() !== '');
}
