/**
 * COMPÁS — Motor: Síntesis del Perfil de Salud
 * ia/motores/motorSintesisPerfil.js
 *
 * ITERACIÓN 10 — Motor modular como calculador real (no solo wrapper).
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * CAMBIO RESPECTO A ITERACIÓN 8:
 *
 *   Antes: el motor llamaba internamente a analizarDatosMunicipio() y usaba
 *          su resultado como fuente principal (simple encapsulación).
 *
 *   Ahora: el motor calcula el análisis directamente desde ContextoIA usando
 *          el Cuadro de Mandos Integral, determinantes EAS, participación
 *          ciudadana y el modelo SFA. Solo si ese cálculo no tiene suficientes
 *          datos cae al motor heredado como fallback.
 *
 * RUTA PRINCIPAL (modular):
 *   _calcularAnalisisModular(contextoIA)
 *     ← CMI (50 indicadores INFOWEB, semáforos, componenteCI)
 *     ← determinantes EAS (mapa código → valor)
 *     ← participación ciudadana (temasFreq, nParticipantes)
 *     ← modelo SFA unificado (8 dimensiones — calcularScoreSFA)
 *   → analisis { fortalezas, oportunidades, conclusiones, recomendaciones,
 *                priorizacion, propuestaEPVSA, alertasInequidad, datosAnalisis }
 *
 * FALLBACK (heredado):
 *   _llamarMotorHeredado(contextoIA)
 *     ← analizarDatosMunicipio()       (HTML l.24486, intacto)
 *     ← ejecutarMotorExpertoCOMPAS()   (HTML l.24357, intacto)
 *   Se activa cuando: sin CMI Y sin determinantes → sinDatos en ruta modular.
 *
 * DIFERENCIAS VISIBLES EN LA UI:
 *   - propuestaEPVSA: [] en ruta modular (no hay mapeo EPVSA sin monolito)
 *   - priorizacion: basada en CMI + SFA, no en ANALYTIC_CONFIG
 *   - conclusiones/recomendaciones: generadas desde CMI, sin PLANTILLAS_SAL
 *   - origenCalculo: 'motor_modular' (identificador de trazabilidad)
 *
 * FUNCIÓN PÚBLICA CLAVE:
 *   adaptarSalidaMotorAAnalisisActual(salidaMotor, contextoIA)
 *   → Convierte SalidaMotor al formato plano que espera window.analisisActual.
 *     Llamada desde window.__COMPAS_ejecutarMotorSintesis() en COMPAS.html.
 *
 * MÓDULO: Sin DOM. Los bridges a funciones heredadas solo se llaman en fallback.
 */

import { crearMotor, ESTADOS_REVISION } from '../motorBase.js';
import { validarContextoAnalitico } from '../validacionIA.js';
import { calcularScoreSFA } from '../modeloSFA.js';

// ─────────────────────────────────────────────────────────────────────────────
// CÁLCULO MODULAR REAL
// (no llama a analizarDatosMunicipio — usa solo ContextoIA)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Calcula el análisis territorial desde el ContextoIA sin depender del monolito.
 *
 * Fuentes de datos que usa:
 *   1. contextoIA.cuadroMandos       → CuadroMandosIntegral (50 indicadores INFOWEB)
 *   2. contextoIA.determinantes      → mapa código → valor (EAS)
 *   3. contextoIA.participacion      → { temasFreq, rankingObjetivos, nParticipantes }
 *   4. calcularScoreSFA(contextoIA)  → 8 dimensiones SFA unificadas
 *   5. contextoIA.fuentes            → inventario de disponibilidad
 *
 * Produce un objeto plano compatible con window.analisisActual:
 *   - conclusiones[]    con { id, texto }          (IDs conocidos por _adaptarAnalisisAFormatoUI)
 *   - recomendaciones[] con { id, texto }|{ area, texto }
 *   - priorizacion[]    con { area, label, score, orden }
 *   - propuestaEPVSA[]  = [] (mapeo EPVSA requiere ESTRUCTURA_EPVSA del monolito)
 *   - fortalezas[], oportunidades[], alertasInequidad[], datosAnalisis{}
 *
 * @param {object} contextoIA - ContextoIA inmutable de contextoIA.js
 * @returns {object} Analisis plano o { sinDatos: true, razon: string }
 */
function _calcularAnalisisModular(contextoIA) {
    const cmi  = contextoIA.cuadroMandos;
    const f    = contextoIA.fuentes || {};
    const nDet = Object.keys(contextoIA.determinantes || {}).length;

    // Guard: necesitamos al menos CMI o determinantes para producir algo útil
    if (!cmi && nDet === 0) {
        return {
            sinDatos: true,
            razon: 'Sin Cuadro de Mandos Integral ni determinantes EAS. Activando fallback al motor heredado.',
        };
    }

    const municipio = contextoIA.ambitoNombre || contextoIA.ambitoId;

    // ── SFA dimensional scores ─────────────────────────────────────────────
    const perfilSFA = calcularScoreSFA(contextoIA);

    // ── Fortalezas (indicadores CMI favorables) ────────────────────────────
    const fortalezas = [];
    if (cmi && cmi.indicadores) {
        cmi.indicadores
            .filter(i => i.esFavorable)
            .slice(0, 8)
            .forEach(i => {
                fortalezas.push({
                    id:           `ind_favorable_${i.numero}`,
                    texto:        `${i.nombre}: tendencia favorable.`,
                    fuente_tipo:  'CMI',
                    especifica:   true,
                });
            });
    }
    if (nDet > 0) {
        fortalezas.push({
            id:          'determinantes_presentes',
            texto:       `Se dispone de ${nDet} determinantes de la salud (Encuesta Andaluza de Salud).`,
            fuente_tipo: 'determinantes',
            especifica:  false,
        });
    }

    // ── Oportunidades (indicadores CMI a mejorar) ──────────────────────────
    const oportunidades = [];
    if (cmi && cmi.indicadores) {
        cmi.indicadores
            .filter(i => i.esAMejorar)
            .slice(0, 8)
            .forEach(i => {
                oportunidades.push({
                    id:          `ind_amejorar_${i.numero}`,
                    texto:       `${i.nombre}: tendencia desfavorable. Área de mejora prioritaria.`,
                    fuente_tipo: 'CMI',
                    especifica:  true,
                });
            });
    }

    // ── Priorización (por categoría CMI, enriquecida con SFA) ──────────────
    //    Cada categoría del CMI es un área de priorización.
    //    Score = proporción de indicadores con tendencia desfavorable.
    //    Mayor score → mayor necesidad de intervención.
    const priorizacion = [];
    if (cmi && cmi.porCategoria) {
        Object.values(cmi.porCategoria)
            .filter(cat => cat.conDatos > 0)
            .map(cat => ({
                area:        cat.id,
                label:       cat.nombre,
                score:       parseFloat((cat.aMejorar / cat.conDatos).toFixed(3)),
                nAMejorar:   cat.aMejorar,
                nFavorables: cat.favorables,
                nConDatos:   cat.conDatos,
                fuente:      'CMI',
            }))
            .sort((a, b) => b.score - a.score)
            .forEach((area, idx) => {
                const pct = Math.round(area.score * 100);
                priorizacion.push({
                    ...area,
                    areaKey: area.area,
                    orden: idx + 1,
                    justificacion: area.nAMejorar > 0
                        ? `${area.nAMejorar} de ${area.nConDatos} indicadores con tendencia desfavorable (${pct}%).`
                        : `${area.nConDatos} indicadores analizados. Sin tendencias desfavorables destacadas.`,
                });
            });
    }

    // ── Alertas de inequidad (desde SFA D4 o CMI determinantes) ───────────
    const alertasInequidad = [];
    const d4Score = perfilSFA.scorePorDimension['d4_inequidad'];
    if (d4Score && d4Score.score !== null && d4Score.score > 0.4) {
        alertasInequidad.push({
            tipo:  'inequidad_sfa',
            texto: `Indicadores de inequidad con score SFA elevado (D4 = ${(d4Score.score * 100).toFixed(0)}%). Revisar gradiente de desigualdad en salud.`,
        });
    }
    // Detectar desde CMI: alta proporción de indicadores desfavorables en determinantes
    if (cmi && cmi.porCategoria && cmi.porCategoria['determinantes']) {
        const catDet = cmi.porCategoria['determinantes'];
        if (catDet.conDatos > 0 && catDet.aMejorar / catDet.conDatos > 0.5) {
            alertasInequidad.push({
                tipo:  'determinantes_desfavorables',
                texto: `En "Determinantes de la salud": ${catDet.aMejorar} de ${catDet.conDatos} indicadores con tendencia desfavorable (${Math.round(catDet.aMejorar / catDet.conDatos * 100)}%).`,
            });
        }
    }

    // ── Conclusiones (con IDs conocidos por _adaptarAnalisisAFormatoUI) ────
    const conclusiones = [];

    // Tendencias CMI (ID: 'tendencias')
    if (cmi && cmi.conTendencias > 0) {
        const pct = cmi.componenteCI;
        const estado = pct >= 60 ? 'favorable' : pct >= 40 ? 'intermedio' : 'con áreas de mejora prioritarias';
        conclusiones.push({
            id:    'tendencias',
            texto: pct !== null
                ? `El ${pct}% de los indicadores de salud con tendencias registradas evoluciona favorablemente. El estado general del municipio es ${estado}.`
                : `Se han analizado las tendencias del Cuadro de Mandos Integral (${cmi.conDatos} de 50 indicadores con datos).`,
        });
    }

    // Categorías CMI con más problemas (ID: 'oportunidades')
    if (cmi && cmi.porCategoria) {
        const catsCriticas = Object.values(cmi.porCategoria)
            .filter(c => c.conDatos > 0 && c.aMejorar / c.conDatos >= 0.3)
            .sort((a, b) => (b.aMejorar / b.conDatos) - (a.aMejorar / a.conDatos))
            .slice(0, 2);
        if (catsCriticas.length) {
            const resumen = catsCriticas
                .map(c => `"${c.nombre}" (${c.aMejorar}/${c.conDatos} indicadores desfavorables)`)
                .join(' y ');
            conclusiones.push({
                id:    'oportunidades',
                texto: `Las áreas con mayor proporción de indicadores con tendencia desfavorable son: ${resumen}.`,
            });
        }
    }

    // Determinantes sociales (ID: 'determinantes_sociales')
    if (nDet > 0) {
        conclusiones.push({
            id:    'determinantes_sociales',
            texto: `Se han considerado ${nDet} determinantes sociales de la salud (Encuesta Andaluza de Salud) en el diagnóstico territorial.`,
        });
    }

    // Priorización ciudadana (ID: 'priorizacion_ciudadana')
    if (f.tienePopular && f.nParticipantes > 0) {
        conclusiones.push({
            id:    'priorizacion_ciudadana',
            texto: `La perspectiva ciudadana (${f.nParticipantes} participantes) ha sido integrada en el análisis territorial.`,
        });
    }

    // Estudios complementarios (ID: 'estudios_complementarios')
    if (f.tieneEstudios && f.nEstudios > 0) {
        conclusiones.push({
            id:    'estudios_complementarios',
            texto: `Se han incorporado ${f.nEstudios} estudio(s) complementario(s) al diagnóstico.`,
        });
    }

    // Marco salutogénico (siempre presente — ID: 'marco_salutogenico')
    conclusiones.push({
        id:    'marco_salutogenico',
        texto: `El análisis se enmarca en el enfoque salutogénico, orientado a identificar los recursos y activos para la salud del territorio.`,
    });

    // Alineamiento EPVSA (siempre presente — ID: 'epvsa_alineamiento')
    conclusiones.push({
        id:    'epvsa_alineamiento',
        texto: `El diagnóstico se encuadra en la Estrategia para la Promoción de la Vida Saludable en Andalucía (EPVSA 2024-2030).`,
    });

    // ── Recomendaciones ────────────────────────────────────────────────────
    const recomendaciones = [];

    // Intervenciones por área prioritaria (sin ID reservado → usa { area, texto })
    priorizacion.slice(0, 3).forEach(area => {
        recomendaciones.push({
            area:  area.label,
            texto: `Desarrollar acciones específicas en "${area.label}" (${area.nAMejorar} indicadores con tendencia desfavorable sobre ${area.nConDatos} con datos).`,
        });
    });

    // Prioridades ciudadanas (IDs rec_popular_N)
    const pop = contextoIA.participacion;
    if (pop && pop.temasFreq) {
        Object.entries(pop.temasFreq)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .forEach(([tema, votos], idx) => {
                recomendaciones.push({
                    id:    `rec_popular_${idx}`,
                    texto: `Prioridad ciudadana #${idx + 1}: "${tema}" (${votos} votos).`,
                });
            });
    }

    // Mapeo de activos (ID: 'mapeo_activos')
    recomendaciones.push({
        id:    'mapeo_activos',
        texto: 'Identificar y movilizar los activos para la salud del territorio como recurso prioritario para las intervenciones.',
    });

    // RELAS gobernanza (ID: 'relas_gobernanza')
    recomendaciones.push({
        id:    'relas_gobernanza',
        texto: 'Incorporar las RELAS como estructura de gobernanza participativa en el seguimiento del plan.',
    });

    // Estudios (ID: 'rec_estudios')
    if (f.tieneEstudios) {
        recomendaciones.push({
            id:    'rec_estudios',
            texto: `Integrar los ${f.nEstudios || '?'} estudios complementarios en el diseño de intervenciones y su seguimiento.`,
        });
    }

    // Evaluación participativa (ID: 'evaluacion_participativa')
    recomendaciones.push({
        id:    'evaluacion_participativa',
        texto: 'Establecer un sistema de seguimiento y evaluación participativo que integre los 50 indicadores del Cuadro de Mandos Integral.',
    });

    // ── datosAnalisis (estadísticas CMI) ──────────────────────────────────
    const datosAnalisis = {
        indicadoresFavorables: cmi ? cmi.indicadores.filter(i => i.esFavorable) : [],
        indicadoresAMejorar:   cmi ? cmi.indicadores.filter(i => i.esAMejorar)  : [],
        totalIndicadores:      cmi ? cmi.conDatos : 0,
    };

    return {
        // ── Campos de compatibilidad con window.analisisActual ─────────────
        municipio,
        motor_version:         '2.0-modular',
        fuentes:               f,

        fortalezas,
        oportunidades,
        conclusiones,
        recomendaciones,
        priorizacion,
        priorizacion_experta:  [],   // sin ANALYTIC_CONFIG en ruta modular
        propuestaEPVSA:        [],   // sin MAPEO_EPVSA/ESTRUCTURA_EPVSA en ruta modular
        alertasInequidad,
        narrativa:             {},   // sin PLANTILLAS_SAL en ruta modular
        perfilSOC:             null, // sin lógica SOC en ruta modular
        datosAnalisis,
        patronesTransversales: [],

        // ── Metadatos de la ruta modular ───────────────────────────────────
        sinDatos:          false,
        origenCalculo:     'motor_modular',
        perfilSFA:         perfilSFA,  // 8 dimensiones SFA, para consumo modular
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// NORMALIZACIÓN DE SALIDA (compatible con ruta modular y heredada)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Convierte cualquier objeto `analisis` (modular o heredado) al formato
 * estructurado del contrato modular SalidaMotor.
 *
 * Compatible con la salida de _calcularAnalisisModular() Y de _llamarMotorHeredado().
 *
 * @param {object} analisis   - Objeto plano de análisis (modular o heredado)
 * @param {object} contextoIA
 * @returns {object}
 */
function _normalizarAnalisis(analisis, contextoIA) {
    if (!analisis) return { sinDatos: true, mensaje: 'El motor no produjo análisis.' };
    if (analisis.sinDatos) return { sinDatos: true, mensaje: analisis.mensaje || 'Sin datos.' };

    const perfil = {
        municipio:             analisis.municipio || contextoIA.ambitoNombre,
        fortalezas:            analisis.fortalezas       || [],
        oportunidades:         analisis.oportunidades    || [],
        nFortalezas:           (analisis.fortalezas       || []).length,
        nOportunidades:        (analisis.oportunidades    || []).length,
        indicadoresFavorables: (analisis.datosAnalisis && analisis.datosAnalisis.indicadoresFavorables) || [],
        indicadoresAMejorar:   (analisis.datosAnalisis && analisis.datosAnalisis.indicadoresAMejorar)   || [],
        totalIndicadores:      (analisis.datosAnalisis && analisis.datosAnalisis.totalIndicadores) || 0,
        alertasInequidad:      analisis.alertasInequidad || [],
        nAlertasInequidad:     (analisis.alertasInequidad || []).length,
        narrativa:             analisis.narrativa || {},
        perfilSOC:             analisis.perfilSOC || null,
    };

    const priorizacion = {
        areas:                analisis.priorizacion         || [],
        nAreas:               (analisis.priorizacion        || []).length,
        areasExperta:         analisis.priorizacion_experta || [],
        patronesTransversales: analisis.patronesTransversales || [],
    };

    const propuestaEPVSA = analisis.propuestaEPVSA || [];

    const conclusiones = {
        lista:    analisis.conclusiones || [],
        nTotal:   (analisis.conclusiones || []).length,
        porFuente: _agruparPorCampo(analisis.conclusiones || [], 'fuente_tipo'),
    };

    const recomendaciones = {
        lista:  analisis.recomendaciones || [],
        nTotal: (analisis.recomendaciones || []).length,
    };

    const motorVersion = analisis.motor_version || analisis._v3_version || '2.0';

    return {
        analisis,           // objeto plano completo (para window.analisisActual)
        perfil,
        priorizacion,
        propuestaEPVSA,
        conclusiones,
        recomendaciones,
        motorVersion,
        trazabilidadInterna: analisis.trazabilidad || null,
        fuentes:             analisis.fuentes || {},
        origenCalculo:       analisis.origenCalculo || 'motor_heredado',
    };
}

function _agruparPorCampo(arr, campo) {
    return arr.reduce((acc, item) => {
        const key = item[campo] || 'sin_clasificar';
        if (!acc[key]) acc[key] = [];
        acc[key].push(item);
        return acc;
    }, {});
}

// ─────────────────────────────────────────────────────────────────────────────
// FALLBACK — MOTOR HEREDADO
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Llama al motor heredado analizarDatosMunicipio() cuando la ruta modular
 * no tiene datos suficientes.
 *
 * analizarDatosMunicipio() y ejecutarMotorExpertoCOMPAS() siguen intactos
 * en COMPAS.html. Este bridge los llama vía scope global.
 *
 * ⚠️ PROVISIONAL: Se elimina cuando los datos se carguen vía repositorios modulares.
 */
function _llamarMotorHeredado(contextoIA) {
    if (typeof analizarDatosMunicipio !== 'function') {
        console.warn('[motorSintesisPerfil] analizarDatosMunicipio no disponible. Usando análisis previo si existe.');
        return contextoIA.analisisPrevio || null;
    }

    const analisis = analizarDatosMunicipio();

    if (analisis && !analisis.sinDatos && typeof ejecutarMotorExpertoCOMPAS === 'function') {
        ejecutarMotorExpertoCOMPAS(analisis);
    }

    // Mantener window.analisisActual en ruta heredada (bridge de compatibilidad)
    if (analisis && !analisis.sinDatos) {
        window.analisisActual = analisis;
    }

    return analisis;
}

// ─────────────────────────────────────────────────────────────────────────────
// CONFIANZA
// ─────────────────────────────────────────────────────────────────────────────

function _calcularConfianza(resultado, contextoIA) {
    if (!resultado || resultado.sinDatos) return 0;

    const f = contextoIA.fuentes || {};
    const nFuentes = [f.tieneInforme, f.tieneEstudios, f.tienePopular,
                      f.tieneDet, f.tieneIndicadores].filter(Boolean).length;

    let confianza = Math.min(0.85, nFuentes * 0.17);

    // Bonus si hay areasExperta (expert system corrió → ruta heredada o enriquecida)
    if (resultado.priorizacion && resultado.priorizacion.areasExperta &&
        resultado.priorizacion.areasExperta.length > 0) {
        confianza = Math.min(0.92, confianza + 0.07);
    }
    // Bonus si el análisis viene de la ruta modular con CMI completo
    if (resultado.origenCalculo === 'motor_modular' && contextoIA.cuadroMandos) {
        const cmi = contextoIA.cuadroMandos;
        if (cmi.coberturaPorcentaje >= 50) confianza = Math.min(0.88, confianza + 0.06);
    }
    // Bonus por conclusiones específicas
    const conclEspecificas = ((resultado.conclusiones && resultado.conclusiones.lista) || [])
        .filter(c => c.especifica).length;
    if (conclEspecificas > 2) confianza = Math.min(0.95, confianza + 0.05);

    return parseFloat(confianza.toFixed(2));
}

// ─────────────────────────────────────────────────────────────────────────────
// DEFINICIÓN DEL MOTOR
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Motor de Síntesis del Perfil de Salud.
 *
 * Ruta principal: _calcularAnalisisModular(contextoIA)
 *   Calcula desde CMI + determinantes + participación + modelo SFA.
 *   NO llama a analizarDatosMunicipio() en condiciones normales.
 *
 * Fallback: _llamarMotorHeredado(contextoIA)
 *   Se activa si la ruta modular devuelve sinDatos (sin CMI ni determinantes).
 *
 * Entrada:  ContextoIA
 * Salida:   SalidaMotor con { perfil, priorizacion, propuestaEPVSA, conclusiones, recomendaciones }
 * Revisión: PENDIENTE — el técnico debe revisar antes de usar el resultado.
 */
export const motorSintesisPerfil = crearMotor({
    id:          'motor_sintesis_perfil',
    version:     '3.0',
    descripcion: 'Síntesis del perfil de salud del territorio. ' +
                 'Ruta principal: cálculo modular desde CMI + determinantes + participación + SFA. ' +
                 'Fallback: motor salutogénico heredado (analizarDatosMunicipio). ' +
                 'No es decisor: produce propuestas para revisión técnica.',

    validarFn: validarContextoAnalitico,

    ejecutarFn(contextoIA) {
        // ── 1. Intentar ruta modular ───────────────────────────────────────
        const analisisModular = _calcularAnalisisModular(contextoIA);

        if (analisisModular && !analisisModular.sinDatos) {
            console.log('[motorSintesisPerfil v3.0] Ruta modular exitosa.',
                `CMI: ${contextoIA.cuadroMandos ? contextoIA.cuadroMandos.conDatos + '/50 ind.' : 'sin CMI'}`,
                `SFA: ${analisisModular.perfilSFA ? analisisModular.perfilSFA.trazabilidad.nDimensionesDisponibles + '/8 dims' : 'no calculado'}`
            );
            return _normalizarAnalisis(analisisModular, contextoIA);
        }

        // ── 2. Fallback: motor heredado ────────────────────────────────────
        console.warn('[motorSintesisPerfil v3.0] Ruta modular sin datos suficientes. Fallback a motor heredado.',
            analisisModular && analisisModular.razon);

        const analisisHeredado = _llamarMotorHeredado(contextoIA);

        if (!analisisHeredado) {
            return { sinDatos: true, mensaje: 'Sin datos suficientes para el análisis (ruta modular y heredada).' };
        }

        return _normalizarAnalisis(analisisHeredado, contextoIA);
    },

    calcularConfianzaFn: _calcularConfianza,
});

// ─────────────────────────────────────────────────────────────────────────────
// FUNCIÓN BRIDGE: SALIDA MODULAR → window.analisisActual
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Transforma la SalidaMotor normalizada al formato plano que espera
 * window.analisisActual y la UI heredada.
 *
 * La UI heredada (_adaptarAnalisisAFormatoUI) lee:
 *   analisis.conclusiones[]    → necesita { id, texto }
 *   analisis.recomendaciones[] → necesita { id, texto } | { area, texto }
 *   analisis.propuestaEPVSA[]  → necesita { lineaId, justificacion, relevancia }
 *   analisis.priorizacion[]    → necesita ser array
 *   analisis.fuentes{}         → mapa de disponibilidad de fuentes
 *
 * Añade campos de trazabilidad (_motorId, _trazabilidadId, etc.) para
 * que el código modular pueda identificar el origen del análisis.
 *
 * @param {Readonly<object>} salidaMotor  - SalidaMotor de motorBase.crearMotor()
 * @param {Readonly<object>} contextoIA   - ContextoIA usado en la ejecución
 * @returns {object|null}  Objeto plano compatible con window.analisisActual
 */
export function adaptarSalidaMotorAAnalisisActual(salidaMotor, contextoIA) {
    if (!salidaMotor || salidaMotor.sinDatos || !salidaMotor.datos) return null;

    const datos = salidaMotor.datos;
    const analisis = datos.analisis;   // objeto plano (modular o heredado)

    if (!analisis || analisis.sinDatos) return null;

    // Añadir metadatos de trazabilidad al objeto plano
    // sin romper la compatibilidad (campos prefijados con _)
    return {
        ...analisis,
        _motorId:           salidaMotor.motorId,
        _motorVersion:      salidaMotor.motorVersion,
        _trazabilidadId:    salidaMotor.trazabilidadId,
        _gradoConfianza:    salidaMotor.gradoConfianza,
        _gradoLabel:        salidaMotor.gradoConfianzaLabel,
        _estadoRevision:    salidaMotor.estadoRevisionHumana,
        _fechaGeneracion:   salidaMotor.fechaGeneracion,
        _fuentesUsadas:     salidaMotor.fuentesUsadas,
        _origenCalculo:     analisis.origenCalculo || 'motor_heredado',
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// BRIDGE DE COMPATIBILIDAD (herencia de iteración 8)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Crea una SalidaMotor desde window.analisisActual ya existente.
 * Útil cuando el análisis ya fue ejecutado por el monolito.
 * estadoRevisionHumana: REVISADO (el monolito ya lo aplicó).
 *
 * @param {string} ambitoId
 * @returns {Promise<Readonly<object>|null>}
 */
export async function salidaDesdeAnalisisHeredado(ambitoId) {
    const analisisHeredado = window.analisisActual;
    if (!analisisHeredado || !ambitoId) return null;

    const { crearContextoIA } = await import('../contextoIA.js');
    const ctx = crearContextoIA({ ambitoId, fuentes: analisisHeredado.fuentes || {} });

    const { crearRegistroTrazabilidad, registrarEjecucion } = await import('../trazabilidadIA.js');
    const { normalizarSalidaMotor } = await import('../motorBase.js');

    const normalizado = _normalizarAnalisis(analisisHeredado, ctx);
    const confianza   = _calcularConfianza(normalizado, ctx);

    const traza = crearRegistroTrazabilidad({
        motorId:       'motor_sintesis_perfil',
        motorVersion:  '3.0',
        ambitoId,
        fuentesUsadas: Object.entries(analisisHeredado.fuentes || {})
            .filter(([, v]) => v).map(([k]) => k),
        gradoConfianza: confianza,
        duracionMs:    0,
        heredado:      true,
        resumenEntrada: { ambitoId, fuentes: analisisHeredado.fuentes },
        resumenSalida:  {
            nAreas: (normalizado.priorizacion || {}).nAreas || 0,
            nConclusiones: (normalizado.conclusiones || {}).nTotal || 0,
        },
    });
    registrarEjecucion(traza);

    return Object.freeze({
        ...normalizarSalidaMotor({ datos: normalizado }, traza),
        estadoRevisionHumana: ESTADOS_REVISION.REVISADO,
    });
}
