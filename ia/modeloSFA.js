/**
 * COMPÁS — Modelo SFA Unificado
 * ia/modeloSFA.js
 *
 * ITERACIÓN 10 — Modelo único, explícito y documentado del sistema de scoring SFA.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * PROBLEMA QUE RESUELVE:
 *
 *   El monolito COMPAS.html contiene DOS configuraciones SFA incompatibles:
 *
 *   • ANALYTIC_CONFIG (l.24220)   — 10 dimensiones. Usado por ejecutarMotorExpertoCOMPAS().
 *   • COMPAS_PESOS_SFA (monolito) — 6 dimensiones. Usado por COMPAS_analizarV3().
 *
 *   Ambas coexisten sin coordinación. Producen vectors de scores de distinta
 *   longitud para las mismas áreas, haciendo imposible comparar resultados
 *   entre el motor v2+expert y el motor v3.
 *
 *   Este módulo define UN ÚNICO modelo de 8 dimensiones para toda la plataforma
 *   modular. Convive con los sistemas heredados sin modificarlos. Los motores
 *   nuevos (motorPriorizacion, motorEvaluacion) lo usan como capa superior.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * DISEÑO DEL MODELO:
 *
 *   8 dimensiones que capturan las distintas fuentes de evidencia de COMPÁS:
 *
 *   D1 — Epidemiología territorial      (fuente: analisisPrevio + determinantes)
 *   D2 — Tendencias CMI                 (fuente: CuadroMandosIntegral)
 *   D3 — Determinantes sociales         (fuente: contextoIA.determinantes EAS)
 *   D4 — Inequidad                      (fuente: analisisPrevio.alertasInequidad)
 *   D5 — Evidencia cualitativa          (fuente: informe + estudios + conclusiones)
 *   D6 — Participación ciudadana        (fuente: contextoIA.participacion)
 *   D7 — Factibilidad institucional     (fuente: planTerritorialId + estrategia)
 *   D8 — Convergencia estratégica EPVSA (fuente: propuestaEPVSA + priorizacion)
 *
 *   Interpretación de scores:
 *     [0-1] donde MAYOR = mayor necesidad de intervención / mayor urgencia.
 *     Excepción: D7 y D8 donde MAYOR = mayor capacidad / mejor alineación.
 *     Cada dimensión devuelve null si no hay datos suficientes.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * RELACIÓN CON MODELOS HEREDADOS:
 *
 *   ANALYTIC_CONFIG (10 dims) → Ver adaptarModeloHeredado('ANALYTIC_CONFIG')
 *   COMPAS_PESOS_SFA (6 dims) → Ver adaptarModeloHeredado('COMPAS_PESOS_SFA')
 *
 *   El mapeo es PROVISIONAL hasta que se audite el contenido exacto de esas
 *   configuraciones en el monolito. Ver MODELO_SFA_UNIFICADO.md.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * MÓDULO PURO: Sin DOM. Sin Firebase. Sin efectos secundarios.
 *              Lee solo de contextoIA. No modifica globales.
 */

// ─────────────────────────────────────────────────────────────────────────────
// IDENTIFICADORES DE DIMENSIÓN
// ─────────────────────────────────────────────────────────────────────────────

/** IDs canónicos de las 8 dimensiones del modelo SFA unificado. */
export const DIM = Object.freeze({
    D1_EPIDEMIOLOGIA:          'd1_epidemiologia',
    D2_TENDENCIAS_CMI:         'd2_tendencias_cmi',
    D3_DETERMINANTES_SOCIALES: 'd3_determinantes_sociales',
    D4_INEQUIDAD:              'd4_inequidad',
    D5_EVIDENCIA_CUALITATIVA:  'd5_evidencia_cualitativa',
    D6_PARTICIPACION:          'd6_participacion',
    D7_FACTIBILIDAD:           'd7_factibilidad_institucional',
    D8_CONVERGENCIA:           'd8_convergencia_estrategica',
});

// ─────────────────────────────────────────────────────────────────────────────
// MODELO SFA UNIFICADO — DEFINICIÓN DE LAS 8 DIMENSIONES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Definición canónica de las 8 dimensiones del modelo SFA unificado COMPÁS.
 *
 * Cada dimensión incluye:
 *   id:             identificador único (usar DIM.*)
 *   nombre:         nombre legible para documentos y UI
 *   descripcion:    qué mide esta dimensión y por qué importa
 *   fuenteDatos:    lista de campos de ContextoIA que alimentan esta dimensión
 *   metodoCalculo:  descripción del algoritmo de cálculo del score [0-1]
 *   pesoBase:       peso en el score total agregado (todos suman 1.0)
 *   interpretacion: cómo leer el score (mayor = más necesidad / más capacidad)
 *
 * ⚠️ Los pesos son una propuesta técnica inicial.
 *    Requieren validación metodológica por el equipo de la estrategia EPVSA.
 */
export const MODELO_SFA_UNIFICADO = Object.freeze({

    version:  '1.0',
    nombre:   'Modelo SFA Unificado COMPÁS',
    nDimensiones: 8,

    dimensiones: Object.freeze({

        [DIM.D1_EPIDEMIOLOGIA]: Object.freeze({
            id:          DIM.D1_EPIDEMIOLOGIA,
            nombre:      'Epidemiología territorial',
            descripcion: 'Carga epidemiológica del municipio derivada del análisis salutogénico. ' +
                         'Captura la intensidad de los problemas de salud identificados por el motor v2, ' +
                         'incluyendo la posición de cada área en la priorizacion del análisis.',
            fuenteDatos: [
                'contextoIA.analisisPrevio.priorizacion[]',
                'contextoIA.analisisPrevio.oportunidades[]',
                'contextoIA.determinantes (mapa código→valor)',
            ],
            metodoCalculo: 'Si analisisPrevio.priorizacion existe: score = media ponderada de la ' +
                           'posición inversa de las áreas (área en rango 1 = score 1.0). ' +
                           'Si solo hay determinantes: score = min(1, nDeterminantes / 20). ' +
                           'Sin datos: null.',
            pesoBase:      0.22,
            interpretacion: 'Mayor score = mayor carga epidemiológica identificada.',
        }),

        [DIM.D2_TENDENCIAS_CMI]: Object.freeze({
            id:          DIM.D2_TENDENCIAS_CMI,
            nombre:      'Tendencias del Cuadro de Mandos Integral',
            descripcion: 'Estado de evolución de los 50 indicadores INFOWEB. Mide la proporción ' +
                         'de indicadores con tendencia desfavorable (observada opuesta a deseada). ' +
                         'Es la dimensión más objetiva del modelo: datos cuantitativos con series temporales.',
            fuenteDatos: [
                'contextoIA.cuadroMandos.componenteCI',
                'contextoIA.cuadroMandos.aMejorar / conTendencias',
                'contextoIA.cuadroMandos.porCategoria{}',
            ],
            metodoCalculo: 'score = 1 - (componenteCI / 100). ' +
                           'componenteCI = % indicadores favorables sobre total con tendencias. ' +
                           'Si sin CMI: score = null. Si CMI sin tendencias: score = 0.5 (neutral).',
            pesoBase:      0.20,
            interpretacion: 'Mayor score = más indicadores con tendencia desfavorable = más urgencia.',
        }),

        [DIM.D3_DETERMINANTES_SOCIALES]: Object.freeze({
            id:          DIM.D3_DETERMINANTES_SOCIALES,
            nombre:      'Determinantes sociales de la salud (EAS)',
            descripcion: 'Presencia y densidad de determinantes sociales en el municipio, ' +
                         'registrados en el marco EAS (Encuesta de Salud de Andalucía). ' +
                         'Captura el contexto social que condiciona la salud más allá de los ' +
                         'eventos clínicos.',
            fuenteDatos: [
                'contextoIA.determinantes (mapa código→valor)',
                'contextoIA.datosMunicipio.determinantes (si existe)',
            ],
            metodoCalculo: 'score = min(1, nDeterminantesRegistrados / UMBRAL_REFERENCIA). ' +
                           'UMBRAL_REFERENCIA = 20 (pendiente de calibrar con catálogo EAS real). ' +
                           'Si no hay determinantes: null.',
            pesoBase:      0.14,
            interpretacion: 'Mayor score = más determinantes sociales registrados.',
            pendiente:     'El catálogo completo de códigos EAS y su umbral de referencia está ' +
                           'en el monolito (parte de datosMunicipioActual). Requiere extracción.',
        }),

        [DIM.D4_INEQUIDAD]: Object.freeze({
            id:          DIM.D4_INEQUIDAD,
            nombre:      'Alertas de inequidad en salud',
            descripcion: 'Presencia de patrones de desigualdad en salud identificados por el ' +
                         'análisis salutogénico. Las alertas de inequidad señalan grupos o ' +
                         'territorios donde la situación de salud es sistemáticamente peor.',
            fuenteDatos: [
                'contextoIA.analisisPrevio.alertasInequidad[]',
            ],
            metodoCalculo: 'score = min(1, nAlertasInequidad / 5). ' +
                           '5 alertas = score máximo (referencia provisional). ' +
                           'Sin analisisPrevio: null.',
            pesoBase:      0.12,
            interpretacion: 'Mayor score = más alertas de inequidad detectadas.',
            pendiente:     'El umbral de 5 alertas debe calibrarse con datos reales de municipios.',
        }),

        [DIM.D5_EVIDENCIA_CUALITATIVA]: Object.freeze({
            id:          DIM.D5_EVIDENCIA_CUALITATIVA,
            nombre:      'Evidencia cualitativa disponible',
            descripcion: 'Riqueza y profundidad de la evidencia cualitativa disponible: ' +
                         'informe de situación de salud, estudios complementarios, conclusiones ' +
                         'del análisis salutogénico. Mayor evidencia = análisis más fundamentado.',
            fuenteDatos: [
                'contextoIA.fuentes.tieneInforme',
                'contextoIA.fuentes.tieneEstudios / nEstudios',
                'contextoIA.analisisPrevio.conclusiones[]',
                'contextoIA.analisisPrevio.oportunidades[]',
            ],
            metodoCalculo: 'Suma ponderada de señales de evidencia: informe(0.30) + ' +
                           'estudios(min(0.25, nEstudios*0.08)) + conclusiones(min(0.25,nConc*0.04)) ' +
                           '+ oportunidades(min(0.20,nOport*0.05)). Sin ninguna: null.',
            pesoBase:      0.12,
            interpretacion: 'Mayor score = más evidencia cualitativa disponible.',
        }),

        [DIM.D6_PARTICIPACION]: Object.freeze({
            id:          DIM.D6_PARTICIPACION,
            nombre:      'Participación ciudadana',
            descripcion: 'Dimensión y riqueza de los datos de participación ciudadana disponibles. ' +
                         'Captura cuánto se conoce de la perspectiva comunitaria sobre las ' +
                         'necesidades de salud percibidas.',
            fuenteDatos: [
                'contextoIA.participacion.totalParticipantes / nParticipantes',
                'contextoIA.participacion.temasFreq (nº temas distintos)',
                'contextoIA.fuentes.nParticipantes',
            ],
            metodoCalculo: 'score_n = min(1, nParticipantes / UMBRAL_PART). ' +
                           'UMBRAL_PART = 100 (municipio con alta participación). ' +
                           'score_temas = min(0.3, nTemasDistintos / 20). ' +
                           'score = 0.7 * score_n + 0.3 * score_temas. ' +
                           'Sin participación: null.',
            pesoBase:      0.12,
            interpretacion: 'Mayor score = más participación ciudadana disponible.',
            pendiente:     'El umbral de 100 participantes debe ajustarse según tamaño del municipio.',
        }),

        [DIM.D7_FACTIBILIDAD]: Object.freeze({
            id:          DIM.D7_FACTIBILIDAD,
            nombre:      'Factibilidad institucional',
            descripcion: 'Capacidad institucional disponible para ejecutar el plan: existencia de ' +
                         'plan territorial activo, agenda anual, y alineación con la estrategia EPVSA. ' +
                         'NOTA: En esta dimensión MAYOR score = MAYOR factibilidad (interpretación inversa).',
            fuenteDatos: [
                'contextoIA.planTerritorialId',
                'contextoIA.estrategia',
                'contextoIA.analisisPrevio (existencia del análisis)',
            ],
            metodoCalculo: 'Suma aditiva: plan_activo(0.40) + estrategia_activa(0.30) + ' +
                           'analisis_previo(0.30). Cada componente es 1 si disponible, 0 si no.',
            pesoBase:      0.10,
            interpretacion: 'Mayor score = mayor capacidad institucional. ' +
                            '⚠️ INTERPRETACIÓN INVERSA: mayor factibilidad no significa más urgencia.',
        }),

        [DIM.D8_CONVERGENCIA]: Object.freeze({
            id:          DIM.D8_CONVERGENCIA,
            nombre:      'Convergencia estratégica EPVSA',
            descripcion: 'Grado de alineación del análisis territorial con el marco estratégico EPVSA: ' +
                         'cuántas líneas EPVSA están activadas, coherencia entre priorización y ' +
                         'propuesta de plan. NOTA: MAYOR score = MAYOR alineación estratégica.',
            fuenteDatos: [
                'contextoIA.analisisPrevio.propuestaEPVSA[]',
                'contextoIA.analisisPrevio.priorizacion[]',
                'contextoIA.analisisPrevio.conclusiones[]',
            ],
            metodoCalculo: 'score_lineas = min(1, nLineasEPVSA / 8). ' +
                           'score_areas = min(0.4, nAreasPrivilizadas / 10). ' +
                           'score = 0.6 * score_lineas + 0.4 * score_areas. ' +
                           'Sin analisisPrevio ni propuestaEPVSA: null.',
            pesoBase:      0.08,
            interpretacion: 'Mayor score = mayor convergencia con el marco EPVSA. ' +
                            '⚠️ INTERPRETACIÓN INVERSA: mayor convergencia no significa más urgencia.',
        }),
    }),
});

// ─────────────────────────────────────────────────────────────────────────────
// PESOS BASE (derivados de MODELO_SFA_UNIFICADO para acceso rápido)
// ─────────────────────────────────────────────────────────────────────────────

/** Pesos de cada dimensión en el score total. Suma = 1.0. */
export const PESOS_SFA_BASE = Object.freeze(
    Object.fromEntries(
        Object.values(MODELO_SFA_UNIFICADO.dimensiones)
              .map(d => [d.id, d.pesoBase])
    )
);

// ─────────────────────────────────────────────────────────────────────────────
// FUNCIONES DE SCORING POR DIMENSIÓN
// (privadas — no exportadas; calcularScoreSFA() es la API pública)
// ─────────────────────────────────────────────────────────────────────────────

/** D1 — Epidemiología territorial */
function _scoreD1(ctx) {
    const previo = ctx.analisisPrevio;
    if (previo && previo.priorizacion && previo.priorizacion.length > 0) {
        const n = previo.priorizacion.length;
        // Promedio ponderado: las áreas en las primeras posiciones tienen mayor score
        const scoreMedio = previo.priorizacion.reduce((sum, area, idx) => {
            const scoreArea = 1 - (idx / n);
            return sum + scoreArea;
        }, 0) / n;
        return parseFloat(Math.min(1, scoreMedio).toFixed(4));
    }
    const nDet = Object.keys(ctx.determinantes || {}).length;
    if (nDet > 0) return parseFloat(Math.min(1, nDet / 20).toFixed(4));
    return null;
}

/** D2 — Tendencias CMI */
function _scoreD2(ctx) {
    const cmi = ctx.cuadroMandos;
    if (!cmi) return null;
    if (cmi.conTendencias > 0 && cmi.componenteCI !== null) {
        // Mayor aMejorar = mayor score (invertir componenteCI)
        return parseFloat(Math.max(0, Math.min(1, 1 - cmi.componenteCI / 100)).toFixed(4));
    }
    // CMI disponible pero sin tendencias → neutral
    if (cmi.conDatos > 0) return 0.5;
    return null;
}

/** D3 — Determinantes sociales EAS */
function _scoreD3(ctx) {
    const det = ctx.determinantes || {};
    const nDet = Object.keys(det).length;
    if (nDet === 0) return null;
    // Umbral provisional: 20 determinantes = score máximo
    return parseFloat(Math.min(1, nDet / 20).toFixed(4));
}

/** D4 — Inequidad en salud */
function _scoreD4(ctx) {
    if (!ctx.analisisPrevio) return null;
    const nAlertas = (ctx.analisisPrevio.alertasInequidad || []).length;
    if (nAlertas === 0 && !ctx.analisisPrevio.priorizacion) return null;
    // Umbral provisional: 5 alertas = score máximo
    return parseFloat(Math.min(1, nAlertas / 5).toFixed(4));
}

/** D5 — Evidencia cualitativa */
function _scoreD5(ctx) {
    const f = ctx.fuentes || {};
    let score = 0;
    let hayAlgo = false;

    if (f.tieneInforme)   { score += 0.30; hayAlgo = true; }
    if (f.tieneEstudios && f.nEstudios > 0) {
        score += Math.min(0.25, (f.nEstudios || 0) * 0.08);
        hayAlgo = true;
    }
    if (ctx.analisisPrevio) {
        const nConc  = (ctx.analisisPrevio.conclusiones  || []).length;
        const nOport = (ctx.analisisPrevio.oportunidades || []).length;
        if (nConc  > 0) { score += Math.min(0.25, nConc  * 0.04); hayAlgo = true; }
        if (nOport > 0) { score += Math.min(0.20, nOport * 0.05); hayAlgo = true; }
    }

    return hayAlgo ? parseFloat(Math.min(1, score).toFixed(4)) : null;
}

/** D6 — Participación ciudadana */
function _scoreD6(ctx) {
    const pop = ctx.participacion;
    const f   = ctx.fuentes || {};
    if (!pop && !f.tienePopular) return null;

    const nPart = (pop && (pop.totalParticipantes || pop.n || f.nParticipantes || 0)) || f.nParticipantes || 0;
    const nTemas = pop && pop.temasFreq
        ? Object.keys(pop.temasFreq).length
        : 0;

    const scoreN     = Math.min(1, nPart / 100);  // umbral provisional: 100 participantes
    const scoreTemas = Math.min(0.3, nTemas / 20); // umbral provisional: 20 temas distintos
    const score      = 0.7 * scoreN + 0.3 * scoreTemas;

    return parseFloat(Math.max(0.05, Math.min(1, score)).toFixed(4));
}

/** D7 — Factibilidad institucional */
function _scoreD7(ctx) {
    let score = 0;
    if (ctx.planTerritorialId)   score += 0.40;
    if (ctx.estrategia)          score += 0.30;
    if (ctx.analisisPrevio)      score += 0.30;
    return score > 0 ? parseFloat(score.toFixed(4)) : null;
}

/** D8 — Convergencia estratégica EPVSA */
function _scoreD8(ctx) {
    const previo = ctx.analisisPrevio;
    if (!previo) return null;

    const nLineas = (previo.propuestaEPVSA || []).length;
    const nAreas  = (previo.priorizacion   || []).length;
    if (nLineas === 0 && nAreas === 0) return null;

    const scoreLineas = Math.min(1,   nLineas / 8);
    const scoreAreas  = Math.min(0.4, nAreas  / 10);
    return parseFloat((0.6 * scoreLineas + 0.4 * scoreAreas).toFixed(4));
}

// ─────────────────────────────────────────────────────────────────────────────
// FUNCIÓN PRINCIPAL: calcularScoreSFA
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Calcula el perfil SFA unificado del territorio a partir del ContextoIA.
 *
 * Devuelve scores para las 8 dimensiones del MODELO_SFA_UNIFICADO.
 * Las dimensiones sin datos disponibles devuelven score=null y se excluyen
 * del scoreTotal (sus pesos se redistribuyen proporcionalmente).
 *
 * @param {object} contextoIA - Objeto ContextoIA de ia/contextoIA.js
 * @returns {{
 *   scoreTotal:        number|null,
 *   scorePorDimension: object,
 *   fuentesUsadas:     string[],
 *   trazabilidad:      object,
 * }}
 */
export function calcularScoreSFA(contextoIA) {
    if (!contextoIA || !contextoIA.ambitoId) {
        return {
            scoreTotal:        null,
            scorePorDimension: {},
            fuentesUsadas:     [],
            trazabilidad:      { error: 'ContextoIA inválido o sin ambitoId.', version: MODELO_SFA_UNIFICADO.version },
        };
    }

    // 1. Calcular score de cada dimensión
    const scorers = {
        [DIM.D1_EPIDEMIOLOGIA]:          _scoreD1,
        [DIM.D2_TENDENCIAS_CMI]:         _scoreD2,
        [DIM.D3_DETERMINANTES_SOCIALES]: _scoreD3,
        [DIM.D4_INEQUIDAD]:              _scoreD4,
        [DIM.D5_EVIDENCIA_CUALITATIVA]:  _scoreD5,
        [DIM.D6_PARTICIPACION]:          _scoreD6,
        [DIM.D7_FACTIBILIDAD]:           _scoreD7,
        [DIM.D8_CONVERGENCIA]:           _scoreD8,
    };

    const scorePorDimension = {};
    const dimensionesDisponibles = [];
    const dimensionesAusentes    = [];

    for (const [dimId, scorerFn] of Object.entries(scorers)) {
        const score = scorerFn(contextoIA);
        const def   = MODELO_SFA_UNIFICADO.dimensiones[dimId];
        scorePorDimension[dimId] = Object.freeze({
            id:           dimId,
            nombre:       def.nombre,
            score,
            disponible:   score !== null,
            pesoBase:     def.pesoBase,
        });
        if (score !== null) dimensionesDisponibles.push(dimId);
        else                dimensionesAusentes.push(dimId);
    }

    // 2. Calcular scoreTotal (solo con dimensiones disponibles)
    let scoreTotal = null;
    if (dimensionesDisponibles.length > 0) {
        // Peso total disponible
        const pesoDisponible = dimensionesDisponibles.reduce(
            (sum, id) => sum + PESOS_SFA_BASE[id], 0
        );
        if (pesoDisponible > 0) {
            const sumaValorada = dimensionesDisponibles.reduce(
                (sum, id) => sum + (scorePorDimension[id].score * PESOS_SFA_BASE[id]),
                0
            );
            // Normalizar al peso disponible (no al total 1.0)
            scoreTotal = parseFloat((sumaValorada / pesoDisponible).toFixed(4));
        }
    }

    // 3. Construir lista de fuentes usadas
    const fuentesUsadas = _inferirFuentesSFA(contextoIA, dimensionesDisponibles);

    // 4. Trazabilidad (metadatos, no registro de trazabilidad formal)
    const trazabilidad = {
        version:                 MODELO_SFA_UNIFICADO.version,
        modeloNombre:            MODELO_SFA_UNIFICADO.nombre,
        ambitoId:                contextoIA.ambitoId,
        timestamp:               new Date().toISOString(),
        nDimensionesTotales:     8,
        nDimensionesDisponibles: dimensionesDisponibles.length,
        nDimensionesAusentes:    dimensionesAusentes.length,
        dimensionesDisponibles,
        dimensionesAusentes,
        pesosEfectivos:          Object.fromEntries(
            dimensionesDisponibles.map(id => [id, PESOS_SFA_BASE[id]])
        ),
        advertencias: _construirAdvertenciasSFA(dimensionesAusentes, contextoIA),
    };

    return Object.freeze({
        scoreTotal,
        scorePorDimension: Object.freeze(scorePorDimension),
        fuentesUsadas:     Object.freeze(fuentesUsadas),
        trazabilidad:      Object.freeze(trazabilidad),
    });
}

/** Lista de fuentes usadas para el resultado SFA. @private */
function _inferirFuentesSFA(contextoIA, dimsDisponibles) {
    const fuentes = [`Modelo SFA Unificado v${MODELO_SFA_UNIFICADO.version} (${dimsDisponibles.length}/8 dimensiones)`];
    const f = contextoIA.fuentes || {};
    if (contextoIA.analisisPrevio)     fuentes.push('Análisis salutogénico previo');
    if (contextoIA.cuadroMandos)       fuentes.push('Cuadro de Mandos Integral (50 indicadores)');
    if (f.tieneDet)                    fuentes.push('Determinantes EAS');
    if (f.tieneInforme)                fuentes.push('Informe de situación de salud');
    if (f.tieneEstudios)               fuentes.push(`Estudios complementarios (${f.nEstudios || '?'})`);
    if (f.tienePopular)                fuentes.push(`Participación ciudadana (${f.nParticipantes || '?'} part.)`);
    return fuentes;
}

/** Genera advertencias sobre dimensiones ausentes. @private */
function _construirAdvertenciasSFA(ausentes, contextoIA) {
    const advertencias = [];
    if (ausentes.includes(DIM.D1_EPIDEMIOLOGIA)) {
        advertencias.push('D1 (Epidemiología) no disponible: se necesita análisis previo o determinantes EAS.');
    }
    if (ausentes.includes(DIM.D2_TENDENCIAS_CMI)) {
        advertencias.push('D2 (Tendencias CMI) no disponible: cargue indicadores INFOWEB desde la Fase 2.');
    }
    if (ausentes.includes(DIM.D6_PARTICIPACION)) {
        advertencias.push('D6 (Participación) no disponible: sin datos de participación ciudadana.');
    }
    if (ausentes.length >= 4) {
        advertencias.push(
            `${ausentes.length}/8 dimensiones sin datos. El scoreTotal tiene baja representatividad. ` +
            'Enriquezca los datos del municipio para un perfil SFA más completo.'
        );
    }
    return advertencias;
}

// ─────────────────────────────────────────────────────────────────────────────
// PUENTE CON MODELOS HEREDADOS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Mapeo provisional de ANALYTIC_CONFIG (10 dimensiones) al modelo unificado (8 dimensiones).
 *
 * ⚠️ PENDIENTE DE AUDITORÍA:
 *   Las dimensiones exactas de ANALYTIC_CONFIG están en el monolito (l.24220)
 *   y no se han auditado todavía. Este mapeo es PROVISIONAL basado en la
 *   estructura SFA documentada para herramientas de salud pública.
 *   Actualizar cuando se audite el monolito.
 *
 * Estructura esperada de ANALYTIC_CONFIG (10 dimensiones SFA):
 *   Basado en la literatura SFA (Antonovsky) y el contexto EPVSA:
 *   1. Carga epidemiológica → D1
 *   2. Factores de riesgo conductual → D3 (determinantes)
 *   3. Enfermedades crónicas → D2 (CMI eventos no transmisibles)
 *   4. Salud mental → D2 (CMI eventos no transmisibles)
 *   5. Prevención → D2 (CMI prevención)
 *   6. Determinantes sociales → D3
 *   7. Participación comunitaria → D6
 *   8. Equidad → D4
 *   9. Capacidad institucional → D7
 *   10. Convergencia EPVSA → D8
 */
const _MAPEO_ANALYTIC_CONFIG = Object.freeze({
    // dim_analytic_config_key → id_unificado
    // PROVISIONAL: estos nombres son suposiciones pendientes de validar
    carga_epidemiologica:         DIM.D1_EPIDEMIOLOGIA,
    factores_riesgo_conductual:   DIM.D3_DETERMINANTES_SOCIALES,
    enfermedades_cronicas:        DIM.D2_TENDENCIAS_CMI,
    salud_mental:                 DIM.D2_TENDENCIAS_CMI,      // fusión en D2
    prevencion:                   DIM.D2_TENDENCIAS_CMI,      // fusión en D2
    determinantes_sociales:       DIM.D3_DETERMINANTES_SOCIALES,
    participacion_comunitaria:    DIM.D6_PARTICIPACION,
    equidad:                      DIM.D4_INEQUIDAD,
    capacidad_institucional:      DIM.D7_FACTIBILIDAD,
    convergencia_epvsa:           DIM.D8_CONVERGENCIA,
});

/**
 * Mapeo provisional de COMPAS_PESOS_SFA (6 dimensiones) al modelo unificado.
 *
 * ⚠️ PENDIENTE DE AUDITORÍA:
 *   Las dimensiones de COMPAS_PESOS_SFA no han sido auditadas en el monolito.
 *   Este mapeo es una hipótesis de trabajo.
 *
 * Estructura esperada de COMPAS_PESOS_SFA (6 dimensiones):
 *   1. Carga de enfermedad → D1 + D2
 *   2. Determinantes → D3
 *   3. Prevención → D2
 *   4. Participación → D6
 *   5. Inequidad → D4
 *   6. Capacidad / convergencia → D7 + D8
 */
const _MAPEO_COMPAS_PESOS_SFA = Object.freeze({
    // PROVISIONAL: pendiente de auditar
    carga_enfermedad:    [DIM.D1_EPIDEMIOLOGIA, DIM.D2_TENDENCIAS_CMI],  // dos dimensiones
    determinantes:       DIM.D3_DETERMINANTES_SOCIALES,
    prevencion:          DIM.D2_TENDENCIAS_CMI,
    participacion:       DIM.D6_PARTICIPACION,
    inequidad:           DIM.D4_INEQUIDAD,
    capacidad:           [DIM.D7_FACTIBILIDAD, DIM.D8_CONVERGENCIA],     // dos dimensiones
});

/**
 * Adapta scores producidos por los motores heredados al formato del modelo unificado.
 *
 * Permite comparar resultados de ANALYTIC_CONFIG y COMPAS_PESOS_SFA con el
 * modelo unificado cuando se migre la lógica de los motores v2 y v3.
 *
 * @param {object} scoresHeredados
 *   Objeto con los scores de cada dimensión del modelo heredado.
 *   Clave = nombre de la dimensión en el modelo heredado.
 *   Valor = score numérico [0-1].
 *
 * @param {'ANALYTIC_CONFIG'|'COMPAS_PESOS_SFA'} tipo
 *   Indica de qué configuración heredada vienen los scores.
 *
 * @returns {{
 *   tipoOrigen:        string,
 *   scoresPorDimUnif:  object,   // dim_unif_id → score (fusionado si hay múltiples fuentes)
 *   mapeoAplicado:     object,   // para auditoría: qué se mapeó a qué
 *   provisional:       boolean,  // siempre true hasta auditoría del monolito
 *   advertencias:      string[],
 * }}
 */
export function adaptarModeloHeredado(scoresHeredados, tipo) {
    const mapeo = tipo === 'ANALYTIC_CONFIG'    ? _MAPEO_ANALYTIC_CONFIG
                : tipo === 'COMPAS_PESOS_SFA'   ? _MAPEO_COMPAS_PESOS_SFA
                : null;

    if (!mapeo) {
        return {
            tipoOrigen:       tipo || 'desconocido',
            scoresPorDimUnif: {},
            mapeoAplicado:    {},
            provisional:      true,
            advertencias:     [`Tipo heredado '${tipo}' no reconocido. Tipos válidos: ANALYTIC_CONFIG, COMPAS_PESOS_SFA.`],
        };
    }

    if (!scoresHeredados || typeof scoresHeredados !== 'object') {
        return {
            tipoOrigen:       tipo,
            scoresPorDimUnif: {},
            mapeoAplicado:    {},
            provisional:      true,
            advertencias:     ['scoresHeredados es nulo o no es un objeto.'],
        };
    }

    // Acumular scores por dimensión unificada (puede haber múltiples fuentes)
    const acumulado = {}; // dimId → [{ scoreOrigen, dimOrigen }]

    for (const [dimOrigen, scoreOrigen] of Object.entries(scoresHeredados)) {
        const destino = mapeo[dimOrigen];
        if (!destino) continue; // sin mapeo conocido para esta dimensión

        const destinos = Array.isArray(destino) ? destino : [destino];
        destinos.forEach(dimId => {
            if (!acumulado[dimId]) acumulado[dimId] = [];
            acumulado[dimId].push({ scoreOrigen: Number(scoreOrigen), dimOrigen });
        });
    }

    // Fusionar scores múltiples (media) cuando varias dimensiones heredadas mapean a una unificada
    const scoresPorDimUnif = {};
    for (const [dimId, entradas] of Object.entries(acumulado)) {
        const media = entradas.reduce((s, e) => s + e.scoreOrigen, 0) / entradas.length;
        scoresPorDimUnif[dimId] = parseFloat(media.toFixed(4));
    }

    // Dimensiones sin mapeo en los scores heredados
    const dimsNoMapeadas = Object.values(DIM)
        .filter(id => scoresPorDimUnif[id] === undefined);

    const advertencias = [
        `⚠️ Mapeo PROVISIONAL: las dimensiones de ${tipo} no han sido auditadas en el monolito.`,
        `Actualizar _MAPEO_${tipo} en ia/modeloSFA.js cuando se realice la auditoría.`,
    ];
    if (dimsNoMapeadas.length > 0) {
        advertencias.push(
            `Dimensiones unificadas sin score heredado: ${dimsNoMapeadas.join(', ')}.`
        );
    }

    return Object.freeze({
        tipoOrigen:       tipo,
        scoresPorDimUnif: Object.freeze(scoresPorDimUnif),
        mapeoAplicado:    Object.freeze({ ...mapeo }),
        provisional:      true,   // siempre true hasta auditoría
        advertencias:     Object.freeze(advertencias),
        nDimsOriginales:  Object.keys(scoresHeredados).length,
        nDimsMapeadas:    Object.keys(scoresPorDimUnif).length,
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS DE CONSULTA
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Devuelve las dimensiones del modelo ordenadas por peso descendente.
 * Útil para documentación y UI.
 * @returns {Array<object>}
 */
export function getDimensionesOrdenadas() {
    return Object.values(MODELO_SFA_UNIFICADO.dimensiones)
        .slice()
        .sort((a, b) => b.pesoBase - a.pesoBase);
}

/**
 * ¿El contextoIA tiene suficientes datos para calcular el SFA con representatividad?
 * (Al menos 4 de 8 dimensiones disponibles)
 * @param {object} contextoIA
 * @returns {{ suficiente: boolean, nDisponibles: number }}
 */
export function tieneDatosSuficientesSFA(contextoIA) {
    const resultado = calcularScoreSFA(contextoIA);
    const n = resultado.trazabilidad.nDimensionesDisponibles;
    return { suficiente: n >= 4, nDisponibles: n };
}

/**
 * Resumen legible del perfil SFA para documentación.
 * @param {{ scoreTotal, scorePorDimension, trazabilidad }} sfaResult
 * @returns {string}
 */
export function resumirPerfilSFA(sfaResult) {
    if (!sfaResult || sfaResult.scoreTotal === null) {
        return 'Perfil SFA no disponible (datos insuficientes).';
    }
    const nivel = sfaResult.scoreTotal >= 0.7 ? 'Alto'
                : sfaResult.scoreTotal >= 0.4 ? 'Medio'
                : 'Bajo';
    const t = sfaResult.trazabilidad;
    return `Perfil SFA: score ${sfaResult.scoreTotal.toFixed(2)} (nivel ${nivel}). ` +
           `${t.nDimensionesDisponibles}/8 dimensiones disponibles. ` +
           `Modelo v${t.version}.`;
}
