/**
 * COMPÁS — Motor: Priorización Multicriterio
 * ia/motores/motorPriorizacion.js
 *
 * ITERACIÓN 9 — Motor modular de priorización de áreas de salud.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * TIPOS SOPORTADOS (únicos tipos válidos según reglas de dominio COMPÁS):
 *
 *   'manual'      — El técnico establece prioridades directamente.
 *                   El motor produce estructura de apoyo y evidencia disponible,
 *                   pero no ordena ni puntúa áreas. El orden es decisión humana.
 *
 *   'estrategica' — Peso mayoritario en evidencia epidemiológica y CMI.
 *                   Enfoque basado en datos: priorizan los problemas con peor
 *                   situación cuantificada (determinantes + indicadores aMejorar).
 *
 *   'tematica'    — Peso mayoritario en participación ciudadana.
 *                   Las prioridades emergen de la perspectiva comunitaria:
 *                   lo que la población señala como más importante.
 *
 *   'mixta'       — Pesos equilibrados entre evidencia epidemiológica, evidencia
 *                   cualitativa y participación ciudadana. Síntesis metodológica.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * SCORING MULTICRITERIO (nuevo, modular, explícito):
 *
 *   4 criterios con pesos variables según el tipo de priorización:
 *
 *   1. EPIDEMIOLÓGICO   — determinantes EAS con valor registrado. Proxy de carga
 *                         de enfermedad. Score proporcional al nº de determinantes
 *                         presentes (sin umbral de "problema": el motor no interpreta).
 *
 *   2. CMI              — indicadores del Cuadro de Mandos Integral con semáforo
 *                         "a mejorar" (tendencia observada opuesta a la deseada).
 *                         Score = nAMejorar / totalConTendencias por categoría.
 *
 *   3. EVIDENCIA CUALITATIVA — señales del informe y del análisis previo.
 *                         Si analisisPrevio tiene oportunidades/alertas, se computan
 *                         como evidencia cualitativa adicional.
 *
 *   4. PARTICIPACIÓN    — frecuencia relativa de temas en participación ciudadana.
 *                         Requiere contextoIA.participacion.temasFreq o rankingObjetivos.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * ⚠️  INCONSISTENCIA METODOLÓGICA HEREDADA — NO RESUELTA:
 *
 *   El monolito COMPAS.html tiene DOS configuraciones de scoring SFA incompatibles:
 *
 *   • ANALYTIC_CONFIG (l.24220): 10 dimensiones SFA
 *     Usada por `ejecutarMotorExpertoCOMPAS()` para enriquecer el análisis v2.
 *
 *   • COMPAS_PESOS_SFA (monolito, localización pendiente de auditar): 6 dimensiones SFA
 *     Usada por `COMPAS_analizarV3()` para el scoring multicriterio del motor v3.
 *
 *   Ambas configuraciones producen scores SFA para las mismas áreas de salud,
 *   pero con distinto número de dimensiones y potencialmente distintos pesos.
 *   Esto significa que motor v2 + expert system y motor v3 pueden producir
 *   priorizaciones distintas para el mismo municipio con los mismos datos.
 *
 *   IMPACTO EN ESTE MOTOR:
 *     Este motor NO usa ANALYTIC_CONFIG ni COMPAS_PESOS_SFA. Implementa su propio
 *     scoring de 4 criterios. Si analisisPrevio existe (del motorSintesisPerfil),
 *     sus áreas se usan como base estructural, pero sus scores SFA no se propagan.
 *     La inconsistencia permanece en el monolito y es un prerequisito bloqueante
 *     para migrar el motor v3. Ver MODELO_PRIORIZACION_Y_EVALUACION.md.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * RELACIÓN CON SISTEMA HEREDADO:
 *   - No modifica window.analisisActual ni window.analisisActualV3.
 *   - No modifica window.COMPAS.prioridades (el técnico aplica tras revisar).
 *   - Si analisisPrevio existe, sus áreas se usan como base de las prioridades.
 *   - analizarDatosMunicipio() y ejecutarMotorExpertoCOMPAS() siguen intactos.
 *
 * MÓDULO PURO: Sin DOM. Sin Firebase. Lee de contextoIA únicamente.
 */

import { crearMotor } from '../motorBase.js';
import { crearResultadoValidacion } from '../validacionIA.js';
import { calcularScoreSFA } from '../modeloSFA.js';

// ─────────────────────────────────────────────────────────────────────────────
// TIPOS DE PRIORIZACIÓN (únicos valores admitidos por regla de dominio)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Tipos de priorización válidos en COMPÁS.
 * Ver ARQUITECTURA_OBJETIVO.md § Priorización.
 */
export const TIPOS_PRIORIZACION = Object.freeze({
    MANUAL:      'manual',
    ESTRATEGICA: 'estrategica',
    TEMATICA:    'tematica',
    MIXTA:       'mixta',
});

// ─────────────────────────────────────────────────────────────────────────────
// PESOS DEL SCORING POR TIPO DE PRIORIZACIÓN
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Pesos de los 4 criterios según el tipo de priorización.
 *
 * Los pesos deben sumar 1.0.
 * Para tipo 'manual' no se aplica scoring (null).
 *
 * Criterios:
 *   epidemiologico  — determinantes EAS presentes (proxy de carga)
 *   cmi             — indicadores CMI con semáforo "a mejorar"
 *   cualitativo     — evidencia del informe y análisis previo
 *   participacion   — señales de la participación ciudadana
 *
 * ⚠️ Estos pesos son una propuesta técnica inicial.
 *    Deben ser revisados y ajustados por el equipo metodológico de la estrategia.
 *    Son distintos e independientes de ANALYTIC_CONFIG y COMPAS_PESOS_SFA.
 */
export const PESOS_SCORING_POR_TIPO = Object.freeze({
    estrategica: Object.freeze({ epidemiologico: 0.45, cmi: 0.30, cualitativo: 0.15, participacion: 0.10 }),
    tematica:    Object.freeze({ epidemiologico: 0.10, cmi: 0.10, cualitativo: 0.30, participacion: 0.50 }),
    mixta:       Object.freeze({ epidemiologico: 0.28, cmi: 0.22, cualitativo: 0.25, participacion: 0.25 }),
    manual:      null, // sin scoring automático
});

// ─────────────────────────────────────────────────────────────────────────────
// VALIDACIÓN DE CONTEXTO (específica para priorización)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Valida el ContextoIA para la priorización.
 *
 * BLOQUEA SI:
 *   - No hay ambitoId
 *   - No hay ninguna fuente de datos
 *
 * ADVIERTE SI:
 *   - El tipo de priorización pedido no es reconocido
 *   - Para tipo 'tematica': sin participación ciudadana el scoring será muy parcial
 *   - Para tipo 'estrategica': sin CMI y sin determinantes el scoring será muy parcial
 *   - Sin analisisPrevio: se usarán las categorías CMI como base de áreas (3 categorías)
 *
 * @param {object} contextoIA
 * @param {string} [motorId]
 * @returns {{ valido: boolean, errores: string[], advertencias: string[] }}
 */
function _validarContextoPriorizacion(contextoIA, motorId = 'motor_priorizacion') {
    const errores = [];
    const advertencias = [];

    if (!contextoIA || typeof contextoIA !== 'object') {
        return crearResultadoValidacion(false, ['Contexto IA nulo o inválido.'], []);
    }
    if (!contextoIA.ambitoId || contextoIA.ambitoId.trim() === '') {
        errores.push('No hay ámbito territorial activo. Seleccione un municipio.');
    }

    const f = contextoIA.fuentes || {};
    const nFuentes = [f.tieneInforme, f.tieneEstudios, f.tienePopular,
                      f.tieneDet, f.tieneIndicadores].filter(Boolean).length;
    if (nFuentes === 0) {
        errores.push(
            'No hay ninguna fuente de datos disponible. ' +
            'Para priorización mínima se necesitan al menos determinantes EAS o indicadores CMI.'
        );
    }

    // Advertencias según tipo
    const tipo = contextoIA._tipoPriorizacion; // campo opcional que puede inyectar el llamador
    if (tipo && !Object.values(TIPOS_PRIORIZACION).includes(tipo)) {
        advertencias.push(
            `Tipo de priorización '${tipo}' no reconocido. ` +
            `Tipos válidos: ${Object.values(TIPOS_PRIORIZACION).join(', ')}. ` +
            'Se usará tipo "mixta" por defecto.'
        );
    }
    if ((tipo === 'tematica' || tipo === 'mixta') && !f.tienePopular) {
        advertencias.push(
            'Sin datos de participación ciudadana. El scoring de tipo ' +
            `'${tipo}' asignará peso participación=0 y redistribuirá entre criterios disponibles.`
        );
    }
    if ((tipo === 'estrategica' || tipo === 'mixta') && !f.tieneDet && !f.tieneIndicadores) {
        advertencias.push(
            'Sin determinantes EAS ni indicadores CMI. El scoring epidemiológico no estará disponible. ' +
            'Se recomienda cargar datos de INFOWEB para priorización estratégica.'
        );
    }
    if (!contextoIA.analisisPrevio) {
        advertencias.push(
            'Sin análisis salutogénico previo. Las áreas se basarán en las 3 categorías CMI ' +
            '(determinantes, eventos no transmisibles, prevención). ' +
            'Para áreas más específicas, ejecute primero el motor de síntesis de perfil.'
        );
    }

    return crearResultadoValidacion(errores.length === 0, errores, advertencias);
}

// ─────────────────────────────────────────────────────────────────────────────
// OBTENCIÓN DE ÁREAS BASE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Determina las áreas de salud sobre las que se realizará la priorización.
 *
 * Estrategia:
 *   1. Si analisisPrevio tiene priorizacion[] → usar esas áreas (más específicas)
 *   2. Si hay cuadroMandos → usar las 3 categorías del CMI como áreas amplias
 *   3. Fallback → áreas vacías (priorización manual sin base)
 *
 * @param {object} contextoIA
 * @returns {Array<{id: string, label: string, origen: string, datosOrigen: object}>}
 */
function _obtenerAreasBase(contextoIA) {
    // Caso 1: analisisPrevio con áreas ya priorizadas por motor salutogénico
    if (contextoIA.analisisPrevio &&
        contextoIA.analisisPrevio.priorizacion &&
        contextoIA.analisisPrevio.priorizacion.length > 0) {
        return contextoIA.analisisPrevio.priorizacion.map((p, idx) => ({
            id:          p.area || p.codigo || `area_${idx}`,
            label:       p.label || p.area || p.nombre || `Área ${idx + 1}`,
            orden:       p.orden || (idx + 1),
            origen:      'analisis_previo',
            datosOrigen: p,
        }));
    }

    // Caso 2: CMI disponible → usar sus 3 categorías como áreas amplias
    const cmi = contextoIA.cuadroMandos;
    if (cmi && cmi.porCategoria) {
        return Object.values(cmi.porCategoria).map((cat, idx) => ({
            id:          cat.id,
            label:       cat.nombre,
            orden:       idx + 1,
            origen:      'categorias_cmi',
            datosOrigen: { categoriaId: cat.id, conDatos: cat.conDatos, aMejorar: cat.aMejorar },
        }));
    }

    // Caso 3: sin base estructurada → devolver vacío
    return [];
}

// ─────────────────────────────────────────────────────────────────────────────
// SCORING POR CRITERIO
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Score epidemiológico de un área [0-1].
 *
 * Usa los determinantes EAS cuando están disponibles.
 * Si el área viene de analisisPrevio, extrae el score epidemiológico del motor v2.
 * Si el área es una categoría CMI, usa la proporción de determinantes en esa categoría.
 *
 * ⚠️ LIMITACIÓN: la conversión determinante→área de salud requiere un mapa de
 *    correspondencia que está en TAXONOMIA_TEMAS del monolito (l.24248).
 *    Mientras no se extraiga ese mapa, el score se aproxima globalmente.
 *
 * @param {object} area
 * @param {object} contextoIA
 * @returns {number} [0-1]
 */
function _scoreEpidemiologico(area, contextoIA) {
    // Caso: área viene de analisisPrevio con peso/score del motor v2
    if (area.origen === 'analisis_previo' && area.datosOrigen) {
        const d = area.datosOrigen;
        // peso_epi, score_epi, o peso_epidemiologico según la estructura del motor v2
        const pesoV2 = d.peso_epi || d.score_epi || d.peso_epidemiologico || null;
        if (pesoV2 !== null && pesoV2 !== undefined) {
            // Normalizar a [0-1] si viene como porcentaje (>1)
            return typeof pesoV2 === 'number' ? Math.min(1, pesoV2 > 1 ? pesoV2 / 100 : pesoV2) : 0;
        }
        // Fallback: usar el rango del area en la priorizacion (mayor rango = peor)
        const total = contextoIA.analisisPrevio.priorizacion.length;
        if (total > 1 && typeof d.orden === 'number') {
            return parseFloat((1 - (d.orden - 1) / total).toFixed(3));
        }
    }

    // Caso: área es una categoría CMI → score por proporción aMejorar
    if (area.origen === 'categorias_cmi') {
        const cmi = contextoIA.cuadroMandos;
        const cat = cmi && cmi.porCategoria && cmi.porCategoria[area.id];
        if (cat && cat.conDatos > 0) {
            return parseFloat((cat.aMejorar / cat.conDatos).toFixed(3));
        }
    }

    // Fallback: ¿hay determinantes? Usamos su presencia como señal mínima
    const nDet = Object.keys(contextoIA.determinantes || {}).length;
    return nDet > 0 ? 0.30 : 0;
}

/**
 * Score CMI de un área [0-1].
 * Basado en la proporción de indicadores con tendencia desfavorable.
 *
 * @param {object} area
 * @param {object} contextoIA
 * @returns {number} [0-1]
 */
function _scoreCMI(area, contextoIA) {
    const cmi = contextoIA.cuadroMandos;
    if (!cmi) return 0;

    // Si el área se corresponde a una categoría CMI, score directo
    const cat = cmi.porCategoria && cmi.porCategoria[area.id];
    if (cat && cat.conDatos > 0) {
        return parseFloat((cat.aMejorar / cat.conDatos).toFixed(3));
    }

    // Si no hay correspondencia directa, score global del CMI como señal contextual
    if (cmi.conTendencias > 0) {
        return parseFloat((cmi.aMejorar / cmi.conTendencias).toFixed(3));
    }

    return 0;
}

/**
 * Score de evidencia cualitativa de un área [0-1].
 *
 * Usa:
 *   - Presencia en oportunidades o alertas del analisisPrevio
 *   - Número de estudios complementarios disponibles (como señal general)
 *   - Presencia de alertasInequidad del análisis previo
 *
 * ⚠️ LIMITACIÓN: sin NLP/indexación textual, no se puede hacer matching
 *    área→textoInforme. El score cualitativo es una señal estructural, no semántica.
 *
 * @param {object} area
 * @param {object} contextoIA
 * @returns {number} [0-1]
 */
function _scoreCualitativo(area, contextoIA) {
    let score = 0;
    const base = contextoIA.analisisPrevio;

    if (base) {
        // Oportunidades y alertas son señales cualitativas
        const nOportunidades  = (base.oportunidades   || []).length;
        const nAlertas        = (base.alertasInequidad || []).length;
        const nConclusiones   = (base.conclusiones     || []).length;

        if (nOportunidades > 0) score += 0.25;
        if (nAlertas > 0)       score += 0.25;
        if (nConclusiones > 2)  score += 0.10;
    }

    // Estudios complementarios presentes (señal de evidencia adicional)
    const f = contextoIA.fuentes || {};
    if (f.tieneEstudios && f.nEstudios > 0) score += Math.min(0.20, f.nEstudios * 0.05);

    // Informe disponible
    if (f.tieneInforme) score += 0.20;

    return parseFloat(Math.min(1, score).toFixed(3));
}

/**
 * Score de participación ciudadana de un área [0-1].
 *
 * Usa temasFreq o rankingObjetivos de la participación ciudadana.
 * Si el área tiene temasCiudadanos en el analisisPrevio, usa ese mapping.
 *
 * @param {object} area
 * @param {object} contextoIA
 * @returns {number} [0-1]
 */
function _scoreParticipacion(area, contextoIA) {
    const pop = contextoIA.participacion;
    if (!pop) return 0;

    // Si el área del analisisPrevio tiene temasCiudadanos mapeados
    if (area.origen === 'analisis_previo' && area.datosOrigen) {
        const temas = area.datosOrigen.temasCiudadanos || area.datosOrigen.temas_ciudadanos || [];
        if (Array.isArray(temas) && temas.length > 0 && pop.temasFreq) {
            // Calcular frecuencia relativa de los temas de esta área
            const totalFreq = Object.values(pop.temasFreq).reduce((s, v) => s + (v || 0), 0);
            if (totalFreq > 0) {
                const freqArea = temas.reduce((s, tema) => {
                    const key = typeof tema === 'string' ? tema : (tema.codigo || tema.id || '');
                    return s + (pop.temasFreq[key] || 0);
                }, 0);
                return parseFloat(Math.min(1, freqArea / totalFreq).toFixed(3));
            }
        }
    }

    // Fallback: si hay rankingObjetivos y el área aparece en él
    if (pop.rankingObjetivos && Array.isArray(pop.rankingObjetivos)) {
        const total = pop.rankingObjetivos.length;
        const pos = pop.rankingObjetivos.findIndex(
            r => r.area === area.id || r.codigo === area.id || r.label === area.label
        );
        if (pos !== -1) {
            return parseFloat((1 - pos / total).toFixed(3));
        }
    }

    // Señal mínima: hay participación pero no se puede mapear al área
    return 0.15;
}

// ─────────────────────────────────────────────────────────────────────────────
// SCORING MULTICRITERIO PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Aplica el scoring multicriterio a todas las áreas base según el tipo de priorización.
 *
 * Para tipo 'manual': devuelve las áreas sin score (el técnico decide el orden).
 * Para otros tipos: calcula score_total y ordena descendentemente.
 *
 * Si un criterio no tiene datos disponibles, su peso se redistribuye
 * proporcionalmente entre los criterios disponibles (no se descarta el resultado).
 *
 * @param {Array}  areas      - Salida de _obtenerAreasBase()
 * @param {string} tipo       - Tipo de priorización (TIPOS_PRIORIZACION)
 * @param {object} contextoIA
 * @returns {Array} Áreas con scores y ranking
 */
function _scoringMulticriterio(areas, tipo, contextoIA) {
    if (!areas.length) return [];

    // Para priorización manual: estructura sin scores
    if (tipo === TIPOS_PRIORIZACION.MANUAL) {
        return areas.map((area, idx) => ({
            ...area,
            rangoSugerido:    idx + 1,
            scoreTotal:       null,
            scores:           null,
            pesos:            null,
            tipoPriorizacion: tipo,
            nota:             'Priorización manual: el técnico establece el orden definitivo.',
        }));
    }

    const pesosBase = PESOS_SCORING_POR_TIPO[tipo] || PESOS_SCORING_POR_TIPO.mixta;
    const f = contextoIA.fuentes || {};

    // Determinar qué criterios tienen datos
    const criteriosDisponibles = {
        epidemiologico: f.tieneDet || f.tieneIndicadores || !!(contextoIA.analisisPrevio),
        cmi:            !!(contextoIA.cuadroMandos && contextoIA.cuadroMandos.conTendencias > 0),
        cualitativo:    f.tieneInforme || f.tieneEstudios || !!(contextoIA.analisisPrevio),
        participacion:  f.tienePopular,
    };

    // Redistribuir pesos de criterios sin datos
    const pesosEfectivos = _redistribuirPesos(pesosBase, criteriosDisponibles);

    // Calcular score para cada área
    const areasConScore = areas.map(area => {
        const scores = {
            epidemiologico: criteriosDisponibles.epidemiologico ? _scoreEpidemiologico(area, contextoIA) : 0,
            cmi:            criteriosDisponibles.cmi            ? _scoreCMI(area, contextoIA)            : 0,
            cualitativo:    criteriosDisponibles.cualitativo    ? _scoreCualitativo(area, contextoIA)    : 0,
            participacion:  criteriosDisponibles.participacion  ? _scoreParticipacion(area, contextoIA)  : 0,
        };

        const scoreTotal = parseFloat(
            (scores.epidemiologico * pesosEfectivos.epidemiologico +
             scores.cmi            * pesosEfectivos.cmi +
             scores.cualitativo    * pesosEfectivos.cualitativo +
             scores.participacion  * pesosEfectivos.participacion
            ).toFixed(4)
        );

        return {
            ...area,
            scores,
            scoreTotal,
            pesos:            pesosEfectivos,
            tipoPriorizacion: tipo,
        };
    });

    // Ordenar de mayor a menor score (mayor = más prioritario)
    areasConScore.sort((a, b) => (b.scoreTotal || 0) - (a.scoreTotal || 0));

    // Asignar rango resultante
    return areasConScore.map((area, idx) => ({
        ...area,
        rangoSugerido: idx + 1,
    }));
}

/**
 * Redistribuye los pesos de criterios sin datos entre los que sí tienen datos.
 * @private
 */
function _redistribuirPesos(pesosBase, disponibles) {
    const pesosSinDatos = Object.entries(pesosBase).reduce((sum, [k, v]) => {
        return sum + (!disponibles[k] ? v : 0);
    }, 0);

    const nDisponibles = Object.values(disponibles).filter(Boolean).length;
    if (nDisponibles === 0) return pesosBase; // sin datos: devuelve pesos originales

    const bonus = pesosSinDatos / nDisponibles;
    const resultado = {};
    for (const [k, v] of Object.entries(pesosBase)) {
        resultado[k] = disponibles[k] ? parseFloat((v + bonus).toFixed(4)) : 0;
    }
    return resultado;
}

// ─────────────────────────────────────────────────────────────────────────────
// NORMALIZACIÓN DE SALIDA
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Construye la salida estructurada del motor de priorización.
 *
 * @param {Array}  areasConScore   - Resultado de _scoringMulticriterio()
 * @param {string} tipo            - Tipo de priorización
 * @param {object} contextoIA
 * @param {string[]} fuentesUsadas
 * @returns {object}
 */
function _normalizarSalidaPriorizacion(areasConScore, tipo, contextoIA, fuentesUsadas) {
    if (!areasConScore.length) {
        return {
            sinDatos: true,
            mensaje: 'No se encontraron áreas de salud base para la priorización. ' +
                     'Cargue datos del municipio o ejecute primero el análisis salutogénico.',
        };
    }

    // Descripción de criterios aplicados
    const criteriosAplicados = [
        {
            id:          'epidemiologico',
            nombre:      'Epidemiológico (determinantes EAS)',
            disponible:  !!(contextoIA.fuentes.tieneDet || contextoIA.analisisPrevio),
            peso:        areasConScore[0].pesos && areasConScore[0].pesos.epidemiologico,
            descripcion: 'Determinantes EAS registrados. Proxy de carga de enfermedad del municipio.',
            limitacion:  'El mapping determinante→área requiere TAXONOMIA_TEMAS del monolito (pendiente de extraer).',
        },
        {
            id:          'cmi',
            nombre:      'Cuadro de Mandos Integral (50 indicadores INFOWEB)',
            disponible:  !!(contextoIA.cuadroMandos && contextoIA.cuadroMandos.conTendencias > 0),
            peso:        areasConScore[0].pesos && areasConScore[0].pesos.cmi,
            descripcion: 'Proporción de indicadores con tendencia desfavorable por categoría CMI.',
            limitacion:  'El mapping indicador→área es parcial (3 categorías CMI ≠ áreas específicas de salud).',
        },
        {
            id:          'cualitativo',
            nombre:      'Evidencia cualitativa (informe + análisis)',
            disponible:  !!(contextoIA.fuentes.tieneInforme || contextoIA.analisisPrevio),
            peso:        areasConScore[0].pesos && areasConScore[0].pesos.cualitativo,
            descripcion: 'Señales del informe de situación de salud y del análisis salutogénico previo.',
            limitacion:  'Sin NLP el matching área→texto es estructural, no semántico.',
        },
        {
            id:          'participacion',
            nombre:      'Participación ciudadana',
            disponible:  !!(contextoIA.fuentes.tienePopular),
            peso:        areasConScore[0].pesos && areasConScore[0].pesos.participacion,
            descripcion: `Frecuencia/relevancia de temas en participación (${contextoIA.fuentes.nParticipantes || 0} participantes).`,
            limitacion:  contextoIA.fuentes.tienePopular
                ? null
                : 'Sin datos de participación. Criterio no disponible en esta ejecución.',
        },
    ];

    // Inconsistencia metodológica heredada — siempre visible
    const inconsistenciaHeredada = {
        presente:       true,
        descripcion:    'ANALYTIC_CONFIG (10 dimensiones) vs COMPAS_PESOS_SFA (6 dimensiones)',
        impacto:        'Los motores v2 y v3 del monolito producen scores SFA incompatibles para las mismas áreas.',
        resolucion:     'Este motor NO usa ninguno de esos sistemas. Usa scoring propio de 4 criterios.',
        pendiente:      'Resolver la inconsistencia es prerequisito para migrar motor_v3_multicriterio.',
        referencias:    ['ANALYTIC_CONFIG l.24220', 'LISTA_HARDCODING.md', 'MODELO_PRIORIZACION_Y_EVALUACION.md'],
    };

    // Justificación del resultado
    const top3 = areasConScore.slice(0, 3).map(a => a.label || a.id).join(', ');
    const justificacion = tipo === TIPOS_PRIORIZACION.MANUAL
        ? `Priorización manual para ${contextoIA.ambitoNombre || contextoIA.ambitoId}. ` +
          `El técnico establece el orden definitivo basándose en la evidencia disponible.`
        : `Priorización ${tipo} para ${contextoIA.ambitoNombre || contextoIA.ambitoId}. ` +
          `Áreas con mayor puntuación multicriterio (rango 1-3): ${top3 || 'sin datos'}. ` +
          `Scoring basado en ${criteriosAplicados.filter(c => c.disponible).length} criterio(s) disponibles. ` +
          `Resultado requiere revisión técnica antes de aplicarse al plan.`;

    return {
        // Propuesta de priorización
        prioridadesPropuestas: areasConScore,
        nAreas:                areasConScore.length,

        // Tipo y configuración del scoring
        tipoPriorizacion:  tipo,
        criteriosAplicados,
        pesosUsados:       areasConScore[0] ? areasConScore[0].pesos : null,

        // Inconsistencia documentada (siempre visible)
        inconsistenciaHeredada,

        // Contexto del resultado
        justificacion,
        fuentesUsadas,

        // Bridge: análisis base si existe
        analisisBase: contextoIA.analisisPrevio || null,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// CONFIANZA
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Calcula el grado de confianza del motor de priorización.
 *
 * Base = nº de criterios con datos disponibles * 0.20
 * Bonus si analisisPrevio enriqueció la base de áreas (+0.10)
 * Bonus si tipo mixta o estrategica y hay ≥3 criterios (+0.08)
 */
function _calcularConfianza(resultado, contextoIA) {
    if (!resultado || resultado.sinDatos) return 0;

    const f = contextoIA.fuentes || {};
    let confianza = 0;

    if (f.tieneDet || f.tieneIndicadores || contextoIA.analisisPrevio) confianza += 0.22;
    if (contextoIA.cuadroMandos && contextoIA.cuadroMandos.conTendencias > 0)  confianza += 0.22;
    if (f.tieneInforme || f.tieneEstudios || contextoIA.analisisPrevio)         confianza += 0.18;
    if (f.tienePopular) confianza += 0.18;

    // Bonus por análisis previo estructurado
    if (contextoIA.analisisPrevio && (contextoIA.analisisPrevio.priorizacion || []).length > 0) {
        confianza = Math.min(0.90, confianza + 0.10);
    }

    // Penalización por inconsistencia SFA si el tipo requiere scoring del monolito
    const tipo = resultado.tipoPriorizacion;
    if (tipo === 'estrategica' && !contextoIA.analisisPrevio) {
        confianza = Math.max(0, confianza - 0.10); // sin análisis previo, scoring estratégico es parcial
    }

    return parseFloat(Math.min(0.88, confianza).toFixed(2));
}

// ─────────────────────────────────────────────────────────────────────────────
// FUENTES PARA TRAZABILIDAD
// ─────────────────────────────────────────────────────────────────────────────

function _extraerFuentes(contextoIA, tipo) {
    const f = contextoIA.fuentes || {};
    const fuentes = [];
    if (f.tieneInforme)     fuentes.push('Informe de situación de salud');
    if (f.tieneEstudios)    fuentes.push(`Estudios complementarios (${f.nEstudios || '?'})`);
    if (f.tienePopular)     fuentes.push(`Participación ciudadana (${f.nParticipantes || '?'} participantes)`);
    if (f.tieneDet)         fuentes.push('Determinantes EAS');
    if (f.tieneIndicadores) fuentes.push('Cuadro de mandos integral (50 indicadores)');
    if (contextoIA.analisisPrevio) fuentes.push('Análisis salutogénico previo (motor_sintesis_perfil)');
    fuentes.push(`Tipo de priorización: ${tipo}`);
    return fuentes;
}

// ─────────────────────────────────────────────────────────────────────────────
// DEFINICIÓN DEL MOTOR
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Motor de Priorización Multicriterio.
 *
 * Tipos soportados: manual | estrategica | tematica | mixta
 *
 * Entrada:  ContextoIA (con campo opcional _tipoPriorizacion)
 * Salida:   SalidaMotor con:
 *             - prioridadesPropuestas[]: áreas ordenadas con scores por criterio
 *             - criteriosAplicados[]:    criterios usados con pesos y disponibilidad
 *             - inconsistenciaHeredada: documentación de la inconsistencia SFA
 *             - justificacion:           texto explicativo del resultado
 * Revisión: PENDIENTE — el técnico debe revisar y decidir el orden definitivo.
 *
 * NOTA: El tipo de priorización se pasa en contextoIA._tipoPriorizacion.
 *       Si no se especifica, se usa 'mixta' como tipo por defecto.
 */
export const motorPriorizacion = crearMotor({
    id:          'motor_priorizacion',
    version:     '1.0',
    descripcion: 'Priorización multicriterio de áreas de salud. ' +
                 'Soporta tipos: manual, estrategica, tematica, mixta. ' +
                 'Scoring explícito en 4 criterios: epidemiológico, CMI, cualitativo, participación. ' +
                 'Propuesta para revisión técnica, no decisión automática.',

    validarFn: _validarContextoPriorizacion,

    ejecutarFn(contextoIA) {
        // Determinar tipo de priorización (default: mixta)
        const tipo = (contextoIA._tipoPriorizacion &&
                      Object.values(TIPOS_PRIORIZACION).includes(contextoIA._tipoPriorizacion))
            ? contextoIA._tipoPriorizacion
            : TIPOS_PRIORIZACION.MIXTA;

        const fuentesUsadas = _extraerFuentes(contextoIA, tipo);

        // 1. Obtener áreas base
        const areasBase = _obtenerAreasBase(contextoIA);

        // 2. Aplicar scoring multicriterio (4 criterios propios — no se elimina)
        const areasConScore = _scoringMulticriterio(areasBase, tipo, contextoIA);

        // 3. Calcular perfil SFA unificado (modelo de 8 dimensiones — capa adicional)
        //    No reemplaza el scoring de 4 criterios; lo enriquece con el perfil territorial.
        const perfilSFA = calcularScoreSFA(contextoIA);

        // 4. Normalizar salida e incluir perfil SFA
        const resultado = _normalizarSalidaPriorizacion(areasConScore, tipo, contextoIA, fuentesUsadas);
        resultado.perfilSFA = perfilSFA;
        return resultado;
    },

    calcularConfianzaFn: _calcularConfianza,
});

// ─────────────────────────────────────────────────────────────────────────────
// BRIDGE DE COMPATIBILIDAD
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Adapta window.COMPAS.prioridades (prioridades ya aplicadas por el monolito)
 * a una SalidaMotor normalizada.
 *
 * ⚠️ PROVISIONAL: Lee desde variables globales del monolito.
 *    Solo para integrar resultados heredados; no re-ejecuta el scoring.
 *    estadoRevisionHumana: REVISADO (el monolito ya las aplicó).
 *
 * @param {string} ambitoId
 * @returns {Promise<Readonly<object>|null>}
 */
export async function salidaDesdePrioridadesHeredadas(ambitoId) {
    const prioridades = typeof window !== 'undefined'
        ? (window.COMPAS && window.COMPAS.prioridades)
        : null;

    if (!prioridades || !ambitoId) return null;

    const { crearContextoIA } = await import('../contextoIA.js');
    const { crearRegistroTrazabilidad, registrarEjecucion } = await import('../trazabilidadIA.js');
    const { normalizarSalidaMotor, ESTADOS_REVISION } = await import('../motorBase.js');

    const ctx = crearContextoIA({
        ambitoId,
        fuentes: {},
    });

    // Las prioridades heredadas pueden ser un array simple o un objeto más complejo
    const areas = Array.isArray(prioridades)
        ? prioridades.map((p, i) => ({
            id:              p.area || p.codigo || `area_${i}`,
            label:           p.label || p.area || p.nombre || `Área ${i + 1}`,
            rangoSugerido:   p.orden || p.rango || (i + 1),
            origen:          'heredado_window_COMPAS',
            tipoPriorizacion: 'desconocido',
            scoreTotal:      null,
            scores:          null,
            pesos:           null,
            datosOrigen:     p,
        }))
        : [];

    const resultado = {
        prioridadesPropuestas: areas,
        nAreas:                areas.length,
        tipoPriorizacion:      'desconocido',
        criteriosAplicados:    [],
        inconsistenciaHeredada: {
            presente:    true,
            descripcion: 'Prioridades leídas de window.COMPAS.prioridades (monolito heredado).',
            impacto:     'No se conoce qué tipo de priorización ni qué criterios usó el monolito.',
            pendiente:   'Migrar lógica de priorización del monolito para reconstruir los criterios.',
        },
        justificacion:  'Prioridades aplicadas previamente por el monolito. Lectura de window.COMPAS.prioridades.',
        fuentesUsadas:  ['window.COMPAS.prioridades (heredado)'],
        analisisBase:   typeof window !== 'undefined' ? window.analisisActual : null,
    };

    const traza = crearRegistroTrazabilidad({
        motorId:       'motor_priorizacion',
        motorVersion:  '1.0',
        ambitoId,
        fuentesUsadas: resultado.fuentesUsadas,
        gradoConfianza: 0.10, // baja confianza: no conocemos los criterios heredados
        duracionMs:    0,
        heredado:      true,
        resumenEntrada: { ambitoId },
        resumenSalida:  { nAreas: areas.length, tipoPriorizacion: 'desconocido' },
    });
    registrarEjecucion(traza);

    return Object.freeze({
        ...normalizarSalidaMotor({ datos: resultado }, traza),
        estadoRevisionHumana: ESTADOS_REVISION.REVISADO,
    });
}
