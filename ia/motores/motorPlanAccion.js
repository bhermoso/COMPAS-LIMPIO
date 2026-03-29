/**
 * COMPÁS — Motor: Generador de Plan de Acción Salutogénico
 * ia/motores/motorPlanAccion.js
 *
 * ITERACIÓN 9 — Alineamiento con marco salutogénico y analisisAccionable.
 *
 * CAMBIOS RESPECTO A ITERACIÓN 8:
 *   - Las propuestas parten de activos detectados y oportunidades comunitarias,
 *     no de problemas o cargas de enfermedad.
 *   - Lógica: señal → activo → oportunidad → línea EPVSA → programa → actuaciones
 *   - Los programas se ordenan priorizando ámbito comunitario e intersectorial
 *     sobre sanitario/clínico cuando hay alternativas equivalentes.
 *   - Las justificaciones de cada línea citan los activos aplicables antes
 *     que los déficits.
 *   - Se lee `window.analisisAccionable` si existe; si no, se deriva
 *     de `analisisActual` de forma transparente.
 *   - Retrocompatibilidad total: propuestaEPVSA, seleccionNormalizada,
 *     aceptarPropuesta, convertirPropuestaASeleccion y aplicarPropuestaACheckboxes
 *     no se modifican.
 *
 * MOTORES HEREDADOS QUE ENCAPSULA:
 *   1. `_generarPropuestaLocal(municipio, datos, pop, analisis)` (HTML l.26092)
 *   2. `generarPropuestaIA()` (HTML l.26034) — sólo orquestador, no llamado aquí
 *
 * REGLA: La IA propone líneas EPVSA, pero el técnico decide qué aceptar.
 *        estadoRevisionHumana siempre comienza como 'pendiente'.
 */

import { crearMotor, ESTADOS_REVISION } from '../motorBase.js';
import { validarContextoPropuesta } from '../validacionIA.js';

// ─────────────────────────────────────────────────────────────────────────────
// ANÁLISIS SALUTOGÉNICO — derivación y enriquecimiento
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Obtiene o deriva el analisisAccionable salutogénico.
 * Si window.analisisAccionable ya existe (generado por motorSintesisPerfil v3+),
 * lo usa directamente. Si no, lo deriva de analisisActual.
 *
 * @param {object|null} analisis  - window.analisisActual
 * @param {object}      contextoIA
 * @returns {object}   analisisAccionable
 */
function _obtenerAnalisisAccionable(analisis, contextoIA) {
    if (typeof window !== 'undefined' && window.analisisAccionable &&
            Array.isArray(window.analisisAccionable.activosDetectados)) {
        return window.analisisAccionable;
    }
    return _derivarAnalisisAccionable(analisis, contextoIA);
}

/**
 * Deriva analisisAccionable desde los campos de analisisActual.
 * Mapeo:
 *   fortalezas[]      → activosDetectados
 *   oportunidades[]   → oportunidadesAccion
 *   participacion     → capacidadesComunitarias
 *   alertasInequidad[]→ senalesRelevantes + colectivosPrioritarios
 *   perfilSFA / dims  → entornosPrioritarios
 *
 * @private
 */
function _derivarAnalisisAccionable(analisis, contextoIA) {
    const a = analisis || {};
    const pop = contextoIA.participacion || {};

    // ── activosDetectados ──────────────────────────────────────────────────
    const activosDetectados = (a.fortalezas || []).map((f, i) => ({
        id:          f.id || ('activo_' + i),
        area:        f.area || '',
        texto:       f.texto || f.especifica || '',
        fuente_tipo: f.fuente_tipo || 'indicador_favorable',
        especifica:  f.especifica || null,
    }));

    // ── oportunidadesAccion ────────────────────────────────────────────────
    const oportunidadesAccion = (a.oportunidades || []).map((o, i) => ({
        id:                 o.id || ('op_' + i),
        area:               o.area || '',
        texto:              o.texto || '',
        prioridad_estimada: o.prioridad_estimada || 0.5,
        fundamento:         o.fundamento || '',
        activosAplicables:  o.activosAplicables || [],
    }));

    // ── capacidadesComunitarias ───────────────────────────────────────────
    const capacidadesComunitarias = [];
    if (pop.nParticipantes || pop.n) {
        capacidadesComunitarias.push({
            tipo:        'participacion',
            descripcion: 'Proceso participativo con ' + (pop.nParticipantes || pop.n || '?') + ' participantes registrados.',
            fuente:      'participacion_popular',
            referencia:  pop.nParticipantes || pop.n || null,
        });
    }
    if (pop.temasFreq && Object.keys(pop.temasFreq).length) {
        capacidadesComunitarias.push({
            tipo:        'expresion_comunitaria',
            descripcion: 'Prioridades ciudadanas expresadas: ' +
                Object.keys(pop.temasFreq).slice(0, 3).join(', ') + '.',
            fuente:      'participacion_popular',
            referencia:  null,
        });
    }
    if (a.narrativa && a.narrativa.activos) {
        capacidadesComunitarias.push({
            tipo:        'activos_narrativa',
            descripcion: a.narrativa.activos,
            fuente:      'motor_sintesis',
            referencia:  null,
        });
    }

    // ── senalesRelevantes ─────────────────────────────────────────────────
    const senalesRelevantes = (a.alertasInequidad || []).map((al, i) => ({
        tipo:              al.tipo || 'inequidad',
        area:              al.area || '',
        texto:             al.texto || '',
        magnitud:          al.magnitud || null,
        colectivo_afectado: al.colectivo || null,
        fuente_tipo:       'alertaInequidad',
    }));

    // Añadir señales desde indicadores a mejorar si existe el campo
    if (a.datosAnalisis && Array.isArray(a.datosAnalisis.indicadoresAMejorar)) {
        a.datosAnalisis.indicadoresAMejorar.slice(0, 5).forEach((ind, i) => {
            senalesRelevantes.push({
                tipo:              'deterioro',
                area:              ind.area || '',
                texto:             ind.texto || ind.codigo || '',
                magnitud:          ind.valor != null ? String(ind.valor) : null,
                colectivo_afectado: null,
                fuente_tipo:       'indicador_amejorar',
            });
        });
    }

    // ── colectivosPrioritarios ────────────────────────────────────────────
    const colectivosPrioritarios = [];
    const colectivosVistos = new Set();
    (a.alertasInequidad || []).forEach((al, i) => {
        if (al.colectivo && !colectivosVistos.has(al.colectivo)) {
            colectivosVistos.add(al.colectivo);
            colectivosPrioritarios.push({
                id:          'col_' + al.colectivo.toLowerCase().replace(/\s/g, '_'),
                nombre:      al.colectivo,
                descripcion: al.texto || '',
                fundamento:  'alertaInequidad',
                senalesIds:  ['al_' + i],
            });
        }
    });

    // ── entornosPrioritarios ──────────────────────────────────────────────
    const ENTORNOS_SFA = [
        { id: 'entorno_comunitario', nombre: 'Entorno comunitario', dims: ['participacion', 'redes', 'apoyo'] },
        { id: 'entorno_escolar',     nombre: 'Entorno escolar',     dims: ['infancia', 'educacion', 'joven'] },
        { id: 'entorno_laboral',     nombre: 'Entorno laboral',     dims: ['trabajo', 'laboral', 'empleo'] },
        { id: 'entorno_sanitario',   nombre: 'Entorno sanitario',   dims: ['salud', 'atencion', 'cuidado'] },
    ];
    const entornosPrioritarios = ENTORNOS_SFA.map(e => ({
        id:          e.id,
        nombre:      e.nombre,
        descripcion: 'Entorno de intervención identificado en el análisis.',
        fundamento:  'analisis_modular',
        areas:       [],
    }));

    return {
        municipio:              a.municipio || '',
        fechaGeneracion:        new Date().toISOString(),
        trazabilidadId:         'aa_derivado_' + Date.now(),
        motorOrigen:            'derivado_analisisActual',
        activosDetectados,
        oportunidadesAccion,
        capacidadesComunitarias,
        senalesRelevantes,
        colectivosPrioritarios,
        entornosPrioritarios,
        trazabilidad: {
            fuentesUsadas:       Object.keys((a.fuentes || {})).filter(k => a.fuentes[k]),
            gradoConfianza:      0.55,
            estadoRevisionHumana:'pendiente',
            camposDerivados: {
                activosDetectados:       'fortalezas[] de analisisActual',
                oportunidadesAccion:     'oportunidades[] de analisisActual',
                capacidadesComunitarias: 'participacion + narrativa.activos',
                senalesRelevantes:       'alertasInequidad[] + indicadoresAMejorar[]',
                colectivosPrioritarios:  'alertasInequidad[].colectivo',
                entornosPrioritarios:    'entornos fijos (pendiente SFA)',
            },
        },
    };
}

/**
 * Orden de preferencia de ámbito de programa.
 * El motor salutogénico prioriza intervenciones comunitarias,
 * municipales e intersectoriales sobre las puramente sanitarias.
 * @private
 */
const _ORDEN_AMBITO = {
    'Comunitario':              0,
    'Educativo':                1,
    'Laboral':                  2,
    'Servicios sociales':       2,
    'Información y comunicación': 3,
    'Formación e investigación':  3,
    'Sanitario':                4,
    'Empresarial':              3,
};

/**
 * Enriquece propuestaEPVSA[] con lente salutogénica.
 *
 * Para cada línea propuesta:
 *   1. Encuentra los activos locales aplicables al área de esa línea.
 *   2. Encuentra la oportunidad comunitaria principal.
 *   3. Reescribe la justificación para que parta de activos, no de déficits.
 *   4. Ordena los programas sugeridos priorizando ámbito comunitario.
 *   5. Añade los campos salutogénicos: activosAplicables, oportunidadComunitaria,
 *      capacidadComunitaria, colectivosPrioritarios, enfoqueSalutogenico.
 *
 * La estructura de propuestaEPVSA[] no cambia: todos los campos existentes
 * se preservan. Solo se modifica `justificacion` y se añaden campos nuevos.
 *
 * @param {Array}  propuestaEPVSA
 * @param {object} aa  - analisisAccionable
 * @returns {Array}    propuestaEPVSA enriquecida (nueva array, sin mutación)
 * @private
 */
function _enriquecerPropuestaSalutogenica(propuestaEPVSA, aa) {
    if (!aa || !propuestaEPVSA || !propuestaEPVSA.length) return propuestaEPVSA;

    const activos       = aa.activosDetectados       || [];
    const oportunidades = aa.oportunidadesAccion      || [];
    const capacidades   = aa.capacidadesComunitarias  || [];
    const colectivos    = aa.colectivosPrioritarios   || [];

    // Texto de capacidad general (primera disponible)
    const textoCapacidad = capacidades.length
        ? capacidades.find(c => c.tipo === 'participacion')?.descripcion
          || capacidades[0].descripcion
        : null;

    return propuestaEPVSA.map(linea => {
        // ── 1. Activos locales para este área/línea ──────────────────────
        const areasLinea = _extraerAreasLinea(linea);
        const activosDeLinea = activos.filter(a =>
            areasLinea.some(area =>
                a.area && area && (
                    a.area.toLowerCase().includes(area.toLowerCase()) ||
                    area.toLowerCase().includes(a.area.toLowerCase())
                )
            )
        ).slice(0, 3);

        // ── 2. Oportunidad comunitaria principal ─────────────────────────
        const opDeLinea = oportunidades.find(o =>
            areasLinea.some(area =>
                o.area && area && (
                    o.area.toLowerCase().includes(area.toLowerCase()) ||
                    area.toLowerCase().includes(o.area.toLowerCase())
                )
            )
        );

        // ── 3. Justificación salutogénica ────────────────────────────────
        let justificacion = linea.justificacion || '';

        if (activosDeLinea.length > 0) {
            const textoActivos = activosDeLinea
                .map(a => a.texto)
                .filter(Boolean)
                .join('; ');
            justificacion = 'Activos locales: ' + textoActivos + '. ' +
                (opDeLinea ? 'Oportunidad: ' + opDeLinea.texto + '. ' : '') +
                justificacion;
        } else if (opDeLinea) {
            justificacion = 'Oportunidad comunitaria: ' + opDeLinea.texto + '. ' + justificacion;
        }

        // ── 4. Programas ordenados por preferencia comunitaria ───────────
        const programasSugeridos = [...(linea.programas_sugeridos || [])].sort((a, b) => {
            const pa = _ORDEN_AMBITO[a.ambito] ?? 3;
            const pb = _ORDEN_AMBITO[b.ambito] ?? 3;
            return pa - pb;
        });

        // ── 5. Campos salutogénicos nuevos ───────────────────────────────
        return {
            ...linea,
            justificacion,
            programas_sugeridos: programasSugeridos,
            // Campos nuevos — no interfieren con aceptarPropuesta ni convertir
            activosAplicables: activosDeLinea.map(a => ({
                id:    a.id,
                area:  a.area,
                texto: a.texto,
            })),
            oportunidadComunitaria: opDeLinea ? opDeLinea.texto : null,
            capacidadComunitaria:   textoCapacidad,
            colectivosPrioritarios: colectivos.slice(0, 2).map(c => ({
                id:     c.id,
                nombre: c.nombre,
            })),
            enfoqueSalutogenico: true,
        };
    });
}

/**
 * Extrae las áreas temáticas de una línea EPVSA para el cruce con analisisAccionable.
 * Lee: linea.justificacion, linea.temasCiudadanos, linea.titulo.
 * @private
 */
function _extraerAreasLinea(linea) {
    const areas = [];
    if (linea.titulo) areas.push(linea.titulo);
    if (linea.temasCiudadanos) areas.push(...linea.temasCiudadanos);
    // Extraer áreas de la justificación original (formato: "Áreas relacionadas: X, Y, Z")
    if (linea.justificacion) {
        const m = linea.justificacion.match(/[Áá]reas relacionadas:\s*([^.]+)/);
        if (m) m[1].split(',').forEach(s => { const t = s.trim(); if (t) areas.push(t); });
        // También capturar el propio texto si menciona áreas cortas
        const palabras = linea.justificacion.split(/[,;.]/).map(s => s.trim()).filter(s => s.length > 3 && s.length < 40);
        areas.push(...palabras.slice(0, 4));
    }
    return [...new Set(areas.filter(Boolean))];
}

// ─────────────────────────────────────────────────────────────────────────────
// NORMALIZACIÓN DE SALIDA
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Normaliza la salida de _generarPropuestaLocal() al formato modular,
 * aplicando el enriquecimiento salutogénico.
 *
 * @param {{ propuestaEPVSA: [], seleccionNormalizada: [] }} resultado
 * @param {object}   contextoIA
 * @param {string[]} fuentesUsadas
 * @param {object}   aa  - analisisAccionable (derivado o nativo)
 * @returns {object}
 */
function _normalizarPropuesta(resultado, contextoIA, fuentesUsadas, aa) {
    if (!resultado) return { sinDatos: true, mensaje: 'El motor no produjo propuesta.' };

    let propuestaEPVSA = resultado.propuestaEPVSA || [];
    const seleccionNormalizada = resultado.seleccionNormalizada || resultado._seleccion || [];

    if (!propuestaEPVSA.length) {
        return { sinDatos: true, mensaje: 'La propuesta está vacía. Puede que falten datos o la estructura EPVSA no esté disponible.' };
    }

    // ── Enriquecimiento salutogénico ───────────────────────────────────────
    propuestaEPVSA = _enriquecerPropuestaSalutogenica(propuestaEPVSA, aa);

    // ── Resumen de la propuesta ────────────────────────────────────────────
    const lineasActivas = propuestaEPVSA.map(p => ({
        lineaId:         p.lineaId,
        lineaCodigo:     p.lineaCodigo || ('LE' + p.lineaId),
        titulo:          p.titulo,
        relevancia:      p.relevancia || 0,
        justificacion:   p.justificacion || '',
        nProgramas:      (p.programas_sugeridos || []).length,
        nObjetivos:      (p.objetivos || []).length,
        temasCiudadanos: p.temasCiudadanos || [],
        // Campos salutogénicos en el resumen
        activosAplicables:      p.activosAplicables || [],
        oportunidadComunitaria: p.oportunidadComunitaria || null,
        colectivosPrioritarios: p.colectivosPrioritarios || [],
    }));

    // ── Justificación global salutogénica ─────────────────────────────────
    const priorizacion = contextoIA.analisisPrevio && contextoIA.analisisPrevio.priorizacion;
    const top3Areas = priorizacion
        ? priorizacion.slice(0, 3).map(p => p.area || p.label || '').filter(Boolean)
        : [];

    const justificacionGlobal = _construirJustificacion(
        lineasActivas, fuentesUsadas, top3Areas,
        contextoIA.ambitoNombre || contextoIA.ambitoId,
        aa
    );

    // ── Acciones sugeridas ─────────────────────────────────────────────────
    const accionesSugeridas = _extraerAccionesSugeridas(propuestaEPVSA);

    return {
        lineasPropuestas:    propuestaEPVSA,
        seleccionNormalizada,
        lineasActivas,
        nLineas:             lineasActivas.length,
        justificacionGlobal,
        fuentesUsadas,
        accionesSugeridas,
        nAccionesSugeridas:  accionesSugeridas.length,
        analisisBase:        contextoIA.analisisPrevio || null,
        // Referencia al objeto salutogénico usado
        analisisAccionableResumen: aa ? {
            nActivos:       (aa.activosDetectados || []).length,
            nOportunidades: (aa.oportunidadesAccion || []).length,
            nCapacidades:   (aa.capacidadesComunitarias || []).length,
            nColectivos:    (aa.colectivosPrioritarios || []).length,
            motorOrigen:    aa.motorOrigen || 'derivado',
        } : null,
    };
}

/**
 * Construye la justificación global de la propuesta.
 * Lógica salutogénica: parte de activos y oportunidades, no de problemas.
 * @private
 */
function _construirJustificacion(lineas, fuentes, top3Areas, municipio, aa) {
    const nLineas   = lineas.length;
    const lineaStr  = lineas.map(l => `${l.lineaCodigo}`).join(', ');
    const fuenteStr = fuentes.length ? `${fuentes.join(', ')}` : 'los datos disponibles';

    // Activos globales destacados
    const nActivos = aa ? (aa.activosDetectados || []).length : 0;
    const nOp      = aa ? (aa.oportunidadesAccion || []).length : 0;
    const primerActivo = aa && (aa.activosDetectados || []).length
        ? aa.activosDetectados[0].texto
        : null;
    const primeraOp = aa && (aa.oportunidadesAccion || []).length
        ? aa.oportunidadesAccion[0].texto
        : null;

    let texto = `Para ${municipio}, el análisis salutogénico identifica `;

    if (nActivos > 0) {
        texto += `${nActivos} ${nActivos === 1 ? 'activo local' : 'activos locales'} `;
        if (primerActivo) texto += `(destacado: ${primerActivo}) `;
    }
    if (nOp > 0) {
        texto += `y ${nOp} ${nOp === 1 ? 'oportunidad de acción comunitaria' : 'oportunidades de acción comunitaria'} `;
        if (primeraOp) texto += `(principal: ${primeraOp}) `;
    }

    texto += `que fundamentan la propuesta de ${nLineas} `;
    texto += nLineas === 1 ? 'línea estratégica EPVSA' : 'líneas estratégicas EPVSA';
    texto += ` (${lineaStr}). `;
    texto += `Propuesta elaborada a partir de: ${fuenteStr}. `;

    if (top3Areas.length) {
        texto += `Áreas de acción prioritarias: ${top3Areas.slice(0, 3).join(', ')}. `;
    }

    texto += 'Las actuaciones propuestas son de carácter comunitario, municipal e intersectorial. ';
    texto += 'Requiere revisión y validación técnica antes de incorporarse al Plan Local de Salud.';

    return texto;
}

/**
 * Extrae las actuaciones-tipo sugeridas de los programas en la propuesta.
 * Incluye el ámbito como campo para filtrado posterior.
 * @private
 */
function _extraerAccionesSugeridas(propuestaEPVSA) {
    const acciones = [];
    propuestaEPVSA.forEach(linea => {
        (linea.programas_sugeridos || []).forEach(prog => {
            (prog.actuaciones_tipo || []).forEach(codActuacion => {
                acciones.push({
                    lineaId:     linea.lineaId,
                    lineaCodigo: linea.lineaCodigo,
                    programa:    prog.codigo,
                    actuacion:   codActuacion,
                    ambito:      prog.ambito || 'comunitario',
                    origen:      'selector_epvsa',
                    // Campo salutogénico: activo que apoya esta actuación
                    activoDeLinea: linea.activosAplicables && linea.activosAplicables[0]
                        ? linea.activosAplicables[0].texto
                        : null,
                });
            });
        });
    });
    return acciones;
}

// ─────────────────────────────────────────────────────────────────────────────
// BRIDGE HACIA FUNCIONES HEREDADAS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Llama a _generarPropuestaLocal() directamente (la lógica pura, sin DOM).
 * @param {object} contextoIA
 * @returns {{ propuestaEPVSA, seleccionNormalizada }|null}
 */
function _llamarGeneradorLocal(contextoIA) {
    const municipio = contextoIA.ambitoNombre || contextoIA.ambitoId;
    const datos     = contextoIA.datosMunicipio || {};
    const pop       = contextoIA.participacion || null;
    const analisis  = contextoIA.analisisPrevio
                   || (typeof window !== 'undefined' ? window.analisisActual : null);

    if (typeof _generarPropuestaLocal === 'function') {
        return _generarPropuestaLocal(municipio, datos, pop, analisis);
    }

    if (analisis && analisis.propuestaEPVSA && analisis.propuestaEPVSA.length) {
        console.warn('[motorPlanAccion] _generarPropuestaLocal no disponible. Usando propuestaEPVSA de analisis.');
        return {
            propuestaEPVSA:       analisis.propuestaEPVSA,
            seleccionNormalizada: analisis.propuestaEPVSA.map(p => ({
                lineaId:      p.lineaId,
                relevancia:   p.relevancia || 70,
                justificacion: p.justificacion || '',
                objetivos: (p._objetivosIdx || []).map(idx => ({ objetivoIdx: idx, indicadores: [] })),
                programas: (p._programasIdx || []).map(idx => ({ programaIdx: idx, actuaciones: [] })),
            })),
        };
    }

    return null;
}

/**
 * Calcula el grado de confianza del motor de propuesta.
 * Bonus por analisisAccionable: indica riqueza del análisis salutogénico.
 */
function _calcularConfianza(resultado, contextoIA) {
    if (!resultado || resultado.sinDatos) return 0;

    const f = contextoIA.fuentes || {};
    const nFuentes = [f.tieneInforme, f.tieneEstudios, f.tienePopular, f.tieneDet].filter(Boolean).length;
    let base = Math.min(0.80, nFuentes * 0.16);

    if (f.tienePopular) base = Math.min(0.88, base + 0.08);

    const nLineas = (resultado.lineasPropuestas || []).length;
    if (nLineas >= 4) base = Math.min(0.90, base + 0.05);

    // Bonus salutogénico: si analisisAccionable tiene activos y oportunidades
    const resumen = resultado.analisisAccionableResumen;
    if (resumen && resumen.nActivos >= 2 && resumen.nOportunidades >= 1) {
        base = Math.min(0.93, base + 0.03);
    }

    return parseFloat(base.toFixed(2));
}

// ─────────────────────────────────────────────────────────────────────────────
// FUENTES PARA TRAZABILIDAD
// ─────────────────────────────────────────────────────────────────────────────

function _extraerFuentes(contextoIA) {
    const f = contextoIA.fuentes || {};
    const fuentes = [];
    if (f.tieneInforme)     fuentes.push('Informe de situación de salud');
    if (f.tieneEstudios)    fuentes.push(`Estudios complementarios (${f.nEstudios || '?'})`);
    if (f.tienePopular)     fuentes.push(`Priorización ciudadana (${f.nParticipantes || '?'} participantes)`);
    if (f.tieneDet)         fuentes.push('Indicadores EAS');
    if (f.tieneIndicadores) fuentes.push('Indicadores CMI');
    fuentes.push('Análisis salutogénico (activos + oportunidades)');
    return fuentes;
}

// ─────────────────────────────────────────────────────────────────────────────
// DEFINICIÓN DEL MOTOR
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Motor Generador de Plan de Acción Salutogénico.
 *
 * Lógica de propuesta: señal → activo → oportunidad → línea EPVSA → programa → actuaciones
 *
 * Entrada:  ContextoIA con analisisPrevio (resultado del motorSintesisPerfil)
 * Salida:   SalidaMotor con:
 *             - lineasPropuestas[]:            líneas EPVSA con campos salutogénicos
 *             - seleccionNormalizada[]:         formato para aplicarPropuestaACheckboxes()
 *             - justificacionGlobal:            parte de activos, no de problemas
 *             - accionesSugeridas[]:            con activoDeLinea y ámbito
 *             - analisisAccionableResumen:      métricas del objeto salutogénico usado
 * Revisión: PENDIENTE — el técnico selecciona qué aceptar antes de generar el plan
 */
export const motorPlanAccion = crearMotor({
    id:          'motor_plan_accion',
    version:     '2.0',
    descripcion: 'Genera la propuesta de plan de acción EPVSA con enfoque salutogénico. ' +
                 'Las propuestas parten de activos locales y oportunidades comunitarias. ' +
                 'Los programas priorizan ámbito comunitario, municipal e intersectorial. ' +
                 'Requiere revisión técnica antes de aplicarse.',

    validarFn: validarContextoPropuesta,

    ejecutarFn(contextoIA) {
        const fuentesUsadas = _extraerFuentes(contextoIA);

        // 1. Obtener o derivar analisisAccionable
        const analisis = contextoIA.analisisPrevio
                      || (typeof window !== 'undefined' ? window.analisisActual : null);
        const aa = _obtenerAnalisisAccionable(analisis, contextoIA);

        // 2. Llamar al generador heredado (lógica pura, sin DOM)
        const resultado = _llamarGeneradorLocal(contextoIA);

        if (!resultado) {
            return {
                sinDatos: true,
                mensaje: 'No se pudo generar la propuesta. ' +
                    'Verifique que el análisis salutogénico se ha ejecutado previamente.',
            };
        }

        // 3. Normalizar + enriquecer con lente salutogénica
        return _normalizarPropuesta(resultado, contextoIA, fuentesUsadas, aa);
    },

    calcularConfianzaFn: _calcularConfianza,
});

// ─────────────────────────────────────────────────────────────────────────────
// BRIDGE DE COMPATIBILIDAD
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Crea una SalidaMotor desde window.analisisActual.propuestaEPVSA ya existente.
 * Útil cuando el monolito ya generó y aplicó una propuesta y se quiere integrarla
 * en el sistema modular sin re-ejecutar el motor.
 *
 * @param {string} ambitoId
 * @returns {Promise<Readonly<object>|null>}
 */
export async function salidaDesdePropuestaHeredada(ambitoId) {
    const analisis = window.analisisActual;
    if (!analisis || !analisis.propuestaEPVSA || !ambitoId) return null;

    const { crearContextoIA }                              = await import('../contextoIA.js');
    const { crearRegistroTrazabilidad, registrarEjecucion } = await import('../trazabilidadIA.js');
    const { normalizarSalidaMotor }                        = await import('../motorBase.js');

    const ctx = crearContextoIA({
        ambitoId,
        fuentes: analisis.fuentes || {},
        analisisPrevio: analisis,
    });

    const aa       = _obtenerAnalisisAccionable(analisis, ctx);
    const resultado = _normalizarPropuesta(
        {
            propuestaEPVSA:       analisis.propuestaEPVSA,
            seleccionNormalizada: (window.propuestaActual) || [],
        },
        ctx,
        _extraerFuentes(ctx),
        aa
    );

    const confianza = _calcularConfianza(resultado, ctx);

    const traza = crearRegistroTrazabilidad({
        motorId:        'motor_plan_accion',
        motorVersion:   '2.0',
        ambitoId,
        fuentesUsadas:  _extraerFuentes(ctx),
        gradoConfianza: confianza,
        duracionMs:     0,
        heredado:       true,
        resumenEntrada: { ambitoId, fuentes: analisis.fuentes },
        resumenSalida: {
            nLineas:    (resultado.lineasPropuestas || []).length,
            nAcciones:  (resultado.accionesSugeridas || []).length,
            nActivos:   resultado.analisisAccionableResumen?.nActivos || 0,
        },
    });
    registrarEjecucion(traza);

    return Object.freeze({
        ...normalizarSalidaMotor({ datos: resultado }, traza),
        estadoRevisionHumana: ESTADOS_REVISION.REVISADO,
    });
}
