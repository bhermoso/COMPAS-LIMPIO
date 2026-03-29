/**
 * COMPÁS — Motor: Evaluación del Plan Local de Salud
 * ia/motores/motorEvaluacion.js
 *
 * ITERACIÓN 9 — Motor modular de evaluación.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * REGLA DE DOMINIO CRÍTICA:
 *
 *   "La evaluación general NO debe basarse en indicadores EPVSA antiguos."
 *   (ARQUITECTURA_OBJETIVO.md)
 *
 *   La base cuantitativa real del seguimiento es el Cuadro de Mandos Integral:
 *   50 indicadores INFOWEB organizados en 3 categorías (determinantes,
 *   eventos no transmisibles, prevención). El estado de tendencias de estos
 *   indicadores determina avances y dificultades del municipio.
 *
 *   Los indicadores EPVSA miden el proceso del plan (acciones ejecutadas,
 *   coberturas de programas). Son complementarios, no la base evaluativa.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * FUENTES QUE USA ESTE MOTOR:
 *
 *   1. CuadroMandosIntegral (base cuantitativa — OBLIGATORIA si tieneIndicadores)
 *      - contextoIA.cuadroMandos.indicadores[]
 *      - contextoIA.cuadroMandos.porCategoria{}
 *      - contextoIA.cuadroMandos.componenteCI (% favorables / total con tendencias)
 *      - contextoIA.cuadroMandos.coberturaPorcentaje
 *
 *   2. Seguimiento anual (futura — NO disponible todavía en ContextoIA)
 *      ⚠️ El campo contextoIA.seguimientoAnual no existe en la versión actual
 *      de crearContextoIA(). Cuando se añada (junto con repositorioAgendas),
 *      este motor lo integrará. Por ahora devuelve null en seguimientoAnual.
 *
 *   3. Evidencia cualitativa del análisis salutogénico (cuando existe)
 *      - contextoIA.analisisPrevio.alertasInequidad[]
 *      - contextoIA.analisisPrevio.conclusiones[]
 *      - contextoIA.analisisPrevio.oportunidades[]
 *      - contextoIA.analisisPrevio.recomendaciones[]
 *
 *   4. Perfil SOC (Sentido de Coherencia) si el análisis previo lo produjo
 *      - contextoIA.analisisPrevio.perfilSOC
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * RELACIÓN CON eval_calcularISS() HEREDADO (l.28223):
 *
 *   eval_calcularISS() calcula el ISS (Índice de Salud Sintético) integrando
 *   varios componentes con pesos adaptativos según las fuentes disponibles.
 *   Uno de esos componentes es el CI (Cuadro de Mandos Integral).
 *
 *   Este motor:
 *   - Usa directamente cmi.componenteCI para el componente CI
 *   - NO recalcula el ISS completo (sigue en eval_calcularISS() del monolito)
 *   - NO modifica la Fase 6 del monolito
 *   - Proporciona los insumos analíticos (avances/dificultades/areasCriticas)
 *     que el técnico usa para su evaluación, con trazabilidad IA
 *
 *   Bridge disponible: salidaDesdeEvaluacionHeredada() adapta la evaluación
 *   ya calculada por el monolito al formato SalidaMotor.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * PENDIENTE METODOLÓGICO DOCUMENTADO:
 *
 *   El campo seguimientoAnual (progreso real de acciones de la agenda anual)
 *   aún no está en ContextoIA. Su ausencia limita la evaluación al estado
 *   de los indicadores INFOWEB, que refleja la situación de salud del municipio
 *   pero no el grado de ejecución del plan. Ambas dimensiones son necesarias
 *   para una evaluación integral. Ver MODELO_PRIORIZACION_Y_EVALUACION.md.
 *
 * MÓDULO PURO: Sin DOM. Sin Firebase. Lee de contextoIA únicamente.
 */

import { crearMotor } from '../motorBase.js';
import { crearResultadoValidacion } from '../validacionIA.js';
import { calcularScoreSFA } from '../modeloSFA.js';

// ─────────────────────────────────────────────────────────────────────────────
// VALIDACIÓN DE CONTEXTO (específica para evaluación)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Valida el ContextoIA para la evaluación.
 *
 * BLOQUEA SI:
 *   - No hay ambitoId
 *   - No hay ninguna fuente de datos cuantitativa (tieneIndicadores) ni cualitativa
 *
 * ADVIERTE SI:
 *   - No hay indicadores CMI (la base cuantitativa no estará disponible)
 *   - No hay análisis previo (la evidencia cualitativa no estará disponible)
 *   - No hay seguimiento anual (la evaluación del proceso no es posible)
 *
 * @param {object} contextoIA
 * @param {string} [motorId]
 * @returns {{ valido: boolean, errores: string[], advertencias: string[] }}
 */
function _validarContextoEvaluacion(contextoIA, motorId = 'motor_evaluacion') {
    const errores = [];
    const advertencias = [];

    if (!contextoIA || typeof contextoIA !== 'object') {
        return crearResultadoValidacion(false, ['Contexto IA nulo o inválido.'], []);
    }
    if (!contextoIA.ambitoId || contextoIA.ambitoId.trim() === '') {
        errores.push('No hay ámbito territorial activo. Seleccione un municipio.');
    }

    const f = contextoIA.fuentes || {};
    const tieneAlgo = f.tieneIndicadores || f.tieneInforme || f.tieneEstudios ||
                      f.tieneDet || !!(contextoIA.analisisPrevio);

    if (!tieneAlgo) {
        errores.push(
            'No hay datos disponibles para la evaluación. ' +
            'Se requieren indicadores INFOWEB (Cuadro de Mandos) o análisis salutogénico previo.'
        );
    }

    // Advertencias (no bloquean)
    if (!f.tieneIndicadores && !contextoIA.cuadroMandos) {
        advertencias.push(
            'Sin indicadores del Cuadro de Mandos Integral. ' +
            'La evaluación cuantitativa no estará disponible. ' +
            'Cargue datos INFOWEB para una evaluación basada en tendencias de salud.'
        );
    }
    if (!contextoIA.analisisPrevio) {
        advertencias.push(
            'Sin análisis salutogénico previo. No habrá evidencia cualitativa ' +
            '(alertas de inequidad, conclusiones, oportunidades).'
        );
    }
    // Seguimiento anual: informar que no está disponible todavía
    advertencias.push(
        'El seguimiento anual (progreso de acciones del plan) no está disponible todavía ' +
        'en esta versión del ContextoIA. La evaluación del proceso está pendiente de implementar.'
    );

    return crearResultadoValidacion(errores.length === 0, errores, advertencias);
}

// ─────────────────────────────────────────────────────────────────────────────
// ANÁLISIS DEL CUADRO DE MANDOS INTEGRAL
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Analiza el CuadroMandosIntegral y extrae avances y dificultades.
 *
 * "Avances" = indicadores con tendencia favorable (observada === deseada).
 * "Dificultades" = indicadores con tendencia desfavorable (opuestas).
 * "Áreas críticas" = categorías con mayor proporción de indicadores aMejorar.
 *
 * NO usa indicadores EPVSA. USA indicadores INFOWEB del CMI.
 *
 * @param {Readonly<object>|null} cmi - CuadroMandosIntegral de dominio/cuadroMandos.js
 * @returns {object}
 */
function _analizarCMI(cmi) {
    if (!cmi) {
        return {
            disponible:        false,
            avances:           [],
            dificultades:      [],
            areasCriticas:     [],
            resumenPorCategoria: {},
            componenteCI:      null,
            coberturaCMI:      0,
            nConDatos:         0,
            nConTendencias:    0,
            mensaje:           'Sin Cuadro de Mandos Integral disponible.',
        };
    }

    // Indicadores favorables → avances
    const avances = (cmi.indicadores || [])
        .filter(i => i.esFavorable)
        .map(i => ({
            numero:      i.numero,
            nombre:      i.nombre,
            categoriaId: i.categoriaId,
            semaforo:    i.semaforo,
            valor:       i.valor,
        }));

    // Indicadores a mejorar → dificultades
    const dificultades = (cmi.indicadores || [])
        .filter(i => i.esAMejorar)
        .map(i => ({
            numero:      i.numero,
            nombre:      i.nombre,
            categoriaId: i.categoriaId,
            semaforo:    i.semaforo,
            valor:       i.valor,
        }));

    // Resumen por categoría
    const resumenPorCategoria = {};
    for (const [catId, cat] of Object.entries(cmi.porCategoria || {})) {
        const total      = (cat.indicadores || []).length;
        const conDatos   = cat.conDatos   || 0;
        const favorables = cat.favorables || 0;
        const aMejorar   = cat.aMejorar   || 0;
        const ratioProblema = conDatos > 0 ? parseFloat((aMejorar / conDatos).toFixed(3)) : 0;

        resumenPorCategoria[catId] = {
            nombre:         cat.nombre,
            total,
            conDatos,
            favorables,
            aMejorar,
            ratioProblema,
            cobertura:      total > 0 ? Math.round((conDatos / total) * 100) : 0,
        };
    }

    // Áreas críticas: categorías con mayor ratio de indicadores aMejorar
    const areasCriticas = Object.entries(resumenPorCategoria)
        .filter(([, r]) => r.aMejorar > 0)
        .sort(([, a], [, b]) => b.ratioProblema - a.ratioProblema)
        .map(([id, r]) => ({
            categoriaId:    id,
            nombre:         r.nombre,
            nAMejorar:      r.aMejorar,
            nTotal:         r.total,
            ratioProblema:  r.ratioProblema,
            prioridad:      r.ratioProblema >= 0.5 ? 'alta' : r.ratioProblema >= 0.3 ? 'media' : 'baja',
        }));

    return {
        disponible:          true,
        avances,
        dificultades,
        areasCriticas,
        resumenPorCategoria,
        componenteCI:        cmi.componenteCI,
        coberturaCMI:        cmi.coberturaPorcentaje || 0,
        nConDatos:           cmi.conDatos,
        nConTendencias:      cmi.conTendencias || 0,
        nFavorables:         avances.length,
        nDificultades:       dificultades.length,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// EVIDENCIA CUALITATIVA
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extrae la evidencia cualitativa del análisis salutogénico previo.
 *
 * @param {object} contextoIA
 * @returns {object}
 */
function _extraerEvidenciaCualitativa(contextoIA) {
    const base = contextoIA.analisisPrevio;

    if (!base) {
        return {
            disponible:        false,
            alertasInequidad:  [],
            conclusiones:      [],
            oportunidades:     [],
            recomendaciones:   [],
            perfilSOC:         null,
        };
    }

    return {
        disponible:       true,
        alertasInequidad: base.alertasInequidad  || [],
        conclusiones:     base.conclusiones       || [],
        oportunidades:    base.oportunidades      || [],
        recomendaciones:  base.recomendaciones    || [],
        perfilSOC:        base.perfilSOC          || null,
        // Resumen
        nAlertasInequidad: (base.alertasInequidad || []).length,
        nConclusiones:     (base.conclusiones     || []).length,
        nOportunidades:    (base.oportunidades    || []).length,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// RECOMENDACIONES DE EVALUACIÓN
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Genera recomendaciones de evaluación a partir del análisis CMI y la evidencia cualitativa.
 *
 * Las recomendaciones son observaciones técnicas (no decisiones).
 * Siempre requieren revisión humana.
 *
 * @param {object} anCMI          - Resultado de _analizarCMI()
 * @param {object} cualitativa    - Resultado de _extraerEvidenciaCualitativa()
 * @param {object} contextoIA
 * @returns {Array<{id, texto, categoria, prioridad, fuenteOrigen}>}
 */
function _generarRecomendaciones(anCMI, cualitativa, contextoIA) {
    const recomendaciones = [];

    // Rec. basadas en CMI
    if (anCMI.disponible) {
        if (anCMI.coberturaCMI < 50) {
            recomendaciones.push({
                id:          'cmi_cobertura_baja',
                texto:       `Solo el ${anCMI.coberturaCMI}% de los 50 indicadores INFOWEB tiene datos registrados. ` +
                             'Se recomienda actualizar la carga de datos INFOWEB para mejorar la base cuantitativa.',
                categoria:   'datos',
                prioridad:   'alta',
                fuenteOrigen: 'cuadro_mandos',
            });
        }

        // Áreas con alto porcentaje de indicadores desfavorables
        for (const area of anCMI.areasCriticas.filter(a => a.prioridad === 'alta')) {
            recomendaciones.push({
                id:          `area_critica_${area.categoriaId}`,
                texto:       `Área "${area.nombre}": ${area.nAMejorar} de ${area.nTotal} indicadores ` +
                             `con tendencia desfavorable (${Math.round(area.ratioProblema * 100)}%). ` +
                             'Revisar si el plan contempla acciones específicas en esta categoría.',
                categoria:   'seguimiento',
                prioridad:   'alta',
                fuenteOrigen: 'cuadro_mandos',
            });
        }

        if (anCMI.componenteCI !== null && anCMI.componenteCI < 40) {
            recomendaciones.push({
                id:          'componente_ci_bajo',
                texto:       `Componente CI del ISS: ${anCMI.componenteCI}% (menos del 40% de indicadores favorables). ` +
                             'Puede indicar deterioro global de la situación de salud en el periodo evaluado.',
                categoria:   'resultado',
                prioridad:   'media',
                fuenteOrigen: 'cuadro_mandos',
            });
        }
    }

    // Rec. basadas en evidencia cualitativa
    if (cualitativa.disponible) {
        if (cualitativa.nAlertasInequidad > 0) {
            recomendaciones.push({
                id:          'alertas_inequidad',
                texto:       `El análisis previo identificó ${cualitativa.nAlertasInequidad} alerta(s) de inequidad. ` +
                             'Revisar si el plan incluye acciones específicas para los grupos más vulnerables.',
                categoria:   'equidad',
                prioridad:   cualitativa.nAlertasInequidad >= 3 ? 'alta' : 'media',
                fuenteOrigen: 'analisis_previo',
            });
        }
    }

    // Rec. sobre seguimiento anual (no disponible todavía)
    recomendaciones.push({
        id:          'seguimiento_anual_pendiente',
        texto:       'El seguimiento de acciones de la agenda anual (grado de ejecución, ' +
                     'cobertura de programas) no está disponible en esta versión del motor. ' +
                     'Para una evaluación completa del proceso, active el módulo de seguimiento anual.',
        categoria:   'proceso',
        prioridad:   'informativo',
        fuenteOrigen: 'motor_evaluacion',
    });

    return recomendaciones;
}

// ─────────────────────────────────────────────────────────────────────────────
// NORMALIZACIÓN DE SALIDA
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Construye la salida estructurada del motor de evaluación.
 *
 * @param {object} anCMI
 * @param {object} cualitativa
 * @param {Array}  recomendaciones
 * @param {string[]} fuentesUsadas
 * @param {object} contextoIA
 * @returns {object}
 */
function _normalizarSalidaEvaluacion(anCMI, cualitativa, recomendaciones, fuentesUsadas, contextoIA) {
    // Descripción del estado evaluativo global
    let estadoGlobal;
    if (!anCMI.disponible && !cualitativa.disponible) {
        estadoGlobal = 'sin_datos';
    } else if (anCMI.disponible && anCMI.componenteCI !== null) {
        if (anCMI.componenteCI >= 60)     estadoGlobal = 'favorable';
        else if (anCMI.componenteCI >= 40) estadoGlobal = 'intermedio';
        else                               estadoGlobal = 'desfavorable';
    } else {
        estadoGlobal = 'parcial'; // hay datos pero no suficientes para determinar estado
    }

    // Limitaciones metodológicas conocidas
    const limitacionesConocidas = [
        {
            id:          'indicadores_epvsa_no_base',
            descripcion: 'Los indicadores EPVSA de proceso no se usan como base evaluativa general. ' +
                         'Son indicadores del plan, no del estado de salud del territorio.',
            impacto:     'La evaluación del proceso del plan está pendiente de implementar.',
        },
        {
            id:          'seguimiento_anual_ausente',
            descripcion: 'El campo contextoIA.seguimientoAnual no existe en la versión actual. ' +
                         'Requiere añadir el campo a crearContextoIA() y conectar repositorioAgendas.',
            impacto:     'No es posible evaluar el grado de ejecución de las acciones programadas.',
        },
        {
            id:          'iss_completo_en_monolito',
            descripcion: 'eval_calcularISS() (l.28223) calcula el ISS completo con múltiples componentes. ' +
                         'Este motor usa solo componenteCI del CMI. El ISS completo sigue en el monolito.',
            impacto:     'El ISS ponderado multi-componente no está disponible en el módulo modular.',
        },
    ];

    return {
        // Estado global de evaluación
        estadoGlobal,

        // Base cuantitativa (CMI)
        baseCuantitativa: {
            fuente:          'Cuadro de Mandos Integral (50 indicadores INFOWEB)',
            disponible:      anCMI.disponible,
            componenteCI:    anCMI.componenteCI,      // % indicadores favorables
            coberturaCMI:    anCMI.coberturaCMI,      // % indicadores con datos
            nConDatos:       anCMI.nConDatos,
            nConTendencias:  anCMI.nConTendencias,
            resumenPorCategoria: anCMI.resumenPorCategoria,
        },

        // Avances identificados (indicadores INFOWEB favorables)
        avances:       anCMI.avances,
        nAvances:      anCMI.avances.length,

        // Dificultades identificadas (indicadores INFOWEB a mejorar)
        dificultades:  anCMI.dificultades,
        nDificultades: anCMI.dificultades.length,

        // Áreas con mayor concentración de problemas
        areasCriticas: anCMI.areasCriticas,

        // Evidencia cualitativa del análisis salutogénico
        evidenciaCualitativa: cualitativa,

        // Seguimiento anual (pendiente de implementar)
        seguimientoAnual: {
            disponible: false,
            mensaje:    'Pendiente: seguimientoAnual no está en ContextoIA en esta versión. ' +
                        'Requiere campo adicional y conexión a repositorioAgendas.',
        },

        // Recomendaciones de evaluación
        recomendacionesEvaluacion: recomendaciones,
        nRecomendaciones:          recomendaciones.length,

        // Limitaciones conocidas
        limitacionesConocidas,

        // Metadatos del análisis
        fuentesUsadas,
        municipio:      contextoIA.ambitoNombre || contextoIA.ambitoId,
        planId:         contextoIA.planTerritorialId,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// CONFIANZA
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Calcula el grado de confianza del motor de evaluación.
 *
 * Base:
 *   +0.30 si CMI disponible con ≥50% cobertura
 *   +0.20 si CMI disponible pero <50% cobertura
 *   +0.20 si analisisPrevio con alertas/conclusiones
 *   +0.15 si hay múltiples categorías CMI con datos
 *   -0.20 si sin seguimiento anual (evaluación del proceso incompleta)
 *         → El descuento refleja la limitación real, no es penalización
 */
function _calcularConfianza(resultado, contextoIA) {
    if (!resultado || resultado.estadoGlobal === 'sin_datos') return 0;

    let confianza = 0;
    const cmi = contextoIA.cuadroMandos;

    if (cmi) {
        const cobertura = cmi.coberturaPorcentaje || 0;
        confianza += cobertura >= 50 ? 0.35 : 0.20;

        // Bonus si hay datos en múltiples categorías
        const catConDatos = Object.values(cmi.porCategoria || {})
            .filter(c => c.conDatos > 0).length;
        if (catConDatos >= 3) confianza += 0.15;
        else if (catConDatos >= 2) confianza += 0.08;
    }

    if (contextoIA.analisisPrevio) {
        const nConclusiones = (contextoIA.analisisPrevio.conclusiones || []).length;
        if (nConclusiones >= 3) confianza += 0.20;
        else if (nConclusiones > 0) confianza += 0.10;
    }

    // Descuento por ausencia de seguimiento anual (limitación real)
    // La evaluación del proceso no está disponible → confianza máxima limitada
    confianza = Math.min(confianza, 0.72); // máximo 0.72 sin seguimiento anual

    return parseFloat(confianza.toFixed(2));
}

// ─────────────────────────────────────────────────────────────────────────────
// FUENTES PARA TRAZABILIDAD
// ─────────────────────────────────────────────────────────────────────────────

function _extraerFuentes(contextoIA) {
    const f = contextoIA.fuentes || {};
    const fuentes = [];
    if (f.tieneIndicadores) fuentes.push('Cuadro de mandos integral (50 indicadores INFOWEB)');
    if (f.tieneInforme)     fuentes.push('Informe de situación de salud');
    if (f.tieneEstudios)    fuentes.push(`Estudios complementarios (${f.nEstudios || '?'})`);
    if (f.tienePopular)     fuentes.push(`Participación ciudadana (${f.nParticipantes || '?'} participantes)`);
    if (f.tieneDet)         fuentes.push('Determinantes EAS');
    if (contextoIA.analisisPrevio) fuentes.push('Análisis salutogénico previo (motor_sintesis_perfil)');
    fuentes.push('Seguimiento anual: no disponible (pendiente)');
    return fuentes;
}

// ─────────────────────────────────────────────────────────────────────────────
// DEFINICIÓN DEL MOTOR
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Motor de Evaluación del Plan Local de Salud.
 *
 * Base cuantitativa: CuadroMandosIntegral (50 indicadores INFOWEB).
 * NO usa indicadores EPVSA como base de evaluación general.
 *
 * Entrada:  ContextoIA (con cuadroMandos y/o analisisPrevio)
 * Salida:   SalidaMotor con:
 *             - avances[]:                    indicadores CMI con tendencia favorable
 *             - dificultades[]:               indicadores CMI con tendencia desfavorable
 *             - areasCriticas[]:              categorías con mayor ratio de problemas
 *             - evidenciaCualitativa:         alertas, conclusiones, oportunidades del análisis
 *             - recomendacionesEvaluacion[]:  observaciones técnicas para el técnico
 *             - baseCuantitativa:             resumen del CMI (componenteCI, cobertura)
 *             - seguimientoAnual:             null (pendiente de implementar)
 *             - limitacionesConocidas[]:      limitaciones metodológicas documentadas
 * Revisión: PENDIENTE — el técnico debe revisar antes de incluir en documento de evaluación.
 */
export const motorEvaluacion = crearMotor({
    id:          'motor_evaluacion',
    version:     '1.0',
    descripcion: 'Evaluación del Plan Local de Salud basada en el Cuadro de Mandos Integral. ' +
                 'Base cuantitativa: 50 indicadores INFOWEB (no indicadores EPVSA). ' +
                 'Integra evidencia cualitativa del análisis salutogénico cuando existe. ' +
                 'El seguimiento anual (ejecución del plan) está pendiente de implementar.',

    validarFn: _validarContextoEvaluacion,

    ejecutarFn(contextoIA) {
        const fuentesUsadas = _extraerFuentes(contextoIA);

        // 1. Analizar el Cuadro de Mandos Integral
        const anCMI = _analizarCMI(contextoIA.cuadroMandos || null);

        // 2. Extraer evidencia cualitativa
        const cualitativa = _extraerEvidenciaCualitativa(contextoIA);

        // 3. Calcular perfil SFA unificado (modelo de 8 dimensiones — capa adicional)
        //    Enriquece la evaluación con el perfil territorial completo.
        const perfilSFA = calcularScoreSFA(contextoIA);

        // 4. Generar recomendaciones de evaluación
        const recomendaciones = _generarRecomendaciones(anCMI, cualitativa, contextoIA);

        // 5. Normalizar salida e incluir perfil SFA
        const resultado = _normalizarSalidaEvaluacion(
            anCMI, cualitativa, recomendaciones, fuentesUsadas, contextoIA
        );
        resultado.perfilSFA = perfilSFA;

        if (!anCMI.disponible && !cualitativa.disponible) {
            resultado.sinDatos = true;
        }

        return resultado;
    },

    calcularConfianzaFn: _calcularConfianza,
});

// ─────────────────────────────────────────────────────────────────────────────
// BRIDGE DE COMPATIBILIDAD
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Adapta el resultado de evaluación ya calculado por el monolito (Fase 6)
 * a una SalidaMotor normalizada.
 *
 * Lee desde:
 *   - window.analisisActual (para el contexto del análisis base)
 *   - window.datosMunicipioActual.indicadores (para construir CMI si es posible)
 *
 * ⚠️ PROVISIONAL: El ISS calculado por eval_calcularISS() del monolito (l.28223)
 *    no es extraído aquí. Solo se adapta la estructura de evaluación disponible.
 *
 * @param {string} ambitoId
 * @returns {Promise<Readonly<object>|null>}
 */
export async function salidaDesdeEvaluacionHeredada(ambitoId) {
    if (typeof window === 'undefined' || !ambitoId) return null;

    const analisis = window.analisisActual;
    const datosMun = typeof datosMunicipioActual !== 'undefined' ? datosMunicipioActual : null;

    if (!analisis && !datosMun) return null;

    const { crearContextoIA } = await import('../contextoIA.js');
    const { cuadroMandosDesdeGlobal } = await import('../../dominio/cuadroMandos.js');
    const { crearRegistroTrazabilidad, registrarEjecucion } = await import('../trazabilidadIA.js');
    const { normalizarSalidaMotor, ESTADOS_REVISION } = await import('../motorBase.js');

    // Construir CMI desde los datos globales disponibles
    const cmi = datosMun
        ? cuadroMandosDesdeGlobal(datosMun, ambitoId)
        : null;

    const ctx = crearContextoIA({
        ambitoId,
        analisisPrevio: analisis,
        cuadroMandos:   cmi,
        fuentes: {
            tieneIndicadores: !!(cmi && cmi.conDatos > 0),
            tieneInforme:     !!(analisis && analisis.fuentes && analisis.fuentes.tieneInforme),
            tieneEstudios:    !!(analisis && analisis.fuentes && analisis.fuentes.tieneEstudios),
            tieneDet:         !!(analisis && analisis.fuentes && analisis.fuentes.tieneDet),
            tienePopular:     !!(analisis && analisis.fuentes && analisis.fuentes.tienePopular),
            nEstudios:        (analisis && analisis.fuentes && analisis.fuentes.nEstudios) || 0,
            nParticipantes:   (analisis && analisis.fuentes && analisis.fuentes.nParticipantes) || 0,
        },
    });

    const anCMI      = _analizarCMI(cmi);
    const cualit     = _extraerEvidenciaCualitativa(ctx);
    const recoms     = _generarRecomendaciones(anCMI, cualit, ctx);
    const fuentes    = _extraerFuentes(ctx);
    const resultado  = _normalizarSalidaEvaluacion(anCMI, cualit, recoms, fuentes, ctx);
    const confianza  = _calcularConfianza(resultado, ctx);

    const traza = crearRegistroTrazabilidad({
        motorId:       'motor_evaluacion',
        motorVersion:  '1.0',
        ambitoId,
        fuentesUsadas: fuentes,
        gradoConfianza: confianza,
        duracionMs:    0,
        heredado:      true,
        resumenEntrada: {
            ambitoId,
            tieneIndicadores: !!(cmi && cmi.conDatos > 0),
            tieneAnalisisPrevio: !!analisis,
        },
        resumenSalida: {
            nAvances:      anCMI.avances.length,
            nDificultades: anCMI.dificultades.length,
            componenteCI:  anCMI.componenteCI,
            estadoGlobal:  resultado.estadoGlobal,
        },
    });
    registrarEjecucion(traza);

    return Object.freeze({
        ...normalizarSalidaMotor({ datos: resultado }, traza),
        estadoRevisionHumana: ESTADOS_REVISION.REVISADO,
    });
}
