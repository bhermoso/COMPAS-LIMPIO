/**
 * COMPÁS — Entidad de dominio: Cuadro de Mandos Integral
 * dominio/cuadroMandos.js
 *
 * ITERACIÓN 6 — Base cuantitativa del seguimiento territorial.
 *
 * REGLA DE DOMINIO (ver ARQUITECTURA_OBJETIVO.md):
 *   Indicadores y cuadro de mandos integral son la MISMA entidad conceptual.
 *   No existe un módulo "indicadores" separado del "cuadro de mandos".
 *   El CuadroMandosIntegral ES la colección estructurada de indicadores
 *   del seguimiento de salud del territorio.
 *
 * QUÉ ES EL CUADRO DE MANDOS INTEGRAL:
 *   50 indicadores cuantitativos organizados en 3 categorías temáticas,
 *   obtenidos de INFOWEB (sistema de información sanitaria de Andalucía).
 *   Cada indicador tiene un valor observado y una tendencia comparada con
 *   la tendencia deseada, lo que permite semáforos de evolución.
 *
 * RELACIÓN CON OTRAS ENTIDADES:
 *   CuadroMandosIntegral
 *     ├── pertenece a un AmbitoTerritorial (ambitoId)
 *     ├── se asocia a un PlanTerritorial (planTerritorialId)
 *     ├── alimenta eval_calcularISS() como componente CI (% indicadores favorables)
 *     └── NO es lo mismo que los indicadores EPVSA de evaluación del proceso
 *
 * ESTADO HEREDADO:
 *   - `CUADRO_MANDOS_INTEGRAL` (HTML l.4723): catálogo con la definición de 50 indicadores
 *   - `generarCuadroMandosIntegral(datosIndicadores)` (HTML l.4806): genera el HTML del CMI
 *   - Firebase: `estrategias/{est}/municipios/{mun}/indicadores` mapa num → {dato, tendencias}
 *   - `window.datosMunicipioActual.indicadores`: datos cargados en memoria
 *   - `TOTAL_INDICADORES_MANDOS = 50` (HTML l.4112)
 *
 * ESTE MÓDULO:
 *   - Define el catálogo de 50 indicadores como constante modular (`CATALOGO_CMI`)
 *   - Crea entidades inmutables `IndicadorCMI` y `CuadroMandosIntegral`
 *   - Formaliza la lógica de semáforo (antes solo en `generarCuadroMandosIntegral`)
 *   - Calcula el componente CI del ISS (antes solo en `eval_calcularISS`)
 *   - Provee bridges desde el formato Firebase heredado
 *
 * MÓDULO PURO: Sin DOM. Sin Firebase. Sin efectos secundarios.
 */

// ─────────────────────────────────────────────────────────────────────────────
// CATÁLOGO CANÓNICO DE 50 INDICADORES
//
// Definición modular equivalente a CUADRO_MANDOS_INTEGRAL del monolito (l.4723).
// El monolito mantiene su propia copia por compatibilidad; cuando se migre,
// esta constante será la única fuente de verdad.
//
// Estructura por categoría:
//   id:         clave de la categoría en Firebase / DOM
//   nombre:     nombre visible
//   icono:      emoji de representación
//   color:      color hexadecimal del CMI
//   fuente:     sistema de información origen
//   indicadores: array de { numero, nombre, unidad }
// ─────────────────────────────────────────────────────────────────────────────

export const CATALOGO_CMI = Object.freeze({

    determinantes: Object.freeze({
        id:     'determinantes',
        nombre: 'Determinantes de la salud',
        icono:  '🌱',
        color:  '#94d40b',
        fuente: 'INFOWEB',
        indicadores: Object.freeze([
            { numero: 1,  nombre: 'Personas con Consumo de Alcohol de alto riesgo',                   unidad: 'N'  },
            { numero: 2,  nombre: 'Personas con Dependencia otras sustancias',                         unidad: 'N'  },
            { numero: 3,  nombre: 'Autonomía funcional (65 y más años)',                               unidad: '%'  },
            { numero: 4,  nombre: 'Lactancia materna (6 meses)',                                       unidad: '%'  },
            { numero: 5,  nombre: 'Población infantil que inicia Lactancia Materna',                   unidad: '%'  },
            { numero: 6,  nombre: 'Personas valoradas en dieta mediterránea',                          unidad: 'N'  },
            { numero: 7,  nombre: 'Personas valoradas en dieta con adhesión a la dieta mediterránea',  unidad: 'N'  },
            { numero: 8,  nombre: 'Personas valoradas en actividad física (de 15 a 64 años)',          unidad: 'N'  },
            { numero: 9,  nombre: 'Personas valoradas en actividad física sin sedentarismo (15-64 a)', unidad: 'N'  },
            { numero: 10, nombre: 'Personas valoradas en act física sin sedentarismo, 65y+',           unidad: 'N'  },
            { numero: 11, nombre: 'Personas valoradas en actividad física con 65 y más años',          unidad: 'N'  },
        ]),
    }),

    eventos_no_transmisibles: Object.freeze({
        id:     'eventos_no_transmisibles',
        nombre: 'Eventos no transmisibles',
        icono:  '🏥',
        color:  '#ff6600',
        fuente: 'INFOWEB',
        indicadores: Object.freeze([
            { numero: 12, nombre: 'Personas con Asma',                                                unidad: 'N'       },
            { numero: 13, nombre: 'Personas con Cardiopatía isquémica',                               unidad: 'N'       },
            { numero: 14, nombre: 'Personas con Cirrosis hepática',                                   unidad: 'N'       },
            { numero: 15, nombre: 'Personas con Diabetes',                                             unidad: 'N'       },
            { numero: 16, nombre: 'Personas con Diagnóstico de pie diabético',                         unidad: 'N'       },
            { numero: 17, nombre: 'Personas con Dislipemia',                                           unidad: 'N'       },
            { numero: 18, nombre: 'Personas con EPOC',                                                 unidad: 'N'       },
            { numero: 19, nombre: 'Personas con Hipertensión',                                         unidad: 'N'       },
            { numero: 20, nombre: 'Prevalencia insuficiencia cardiaca',                                unidad: '%'       },
            { numero: 21, nombre: 'Personas con Insuficiencia renal crónica',                          unidad: 'N'       },
            { numero: 22, nombre: 'Personas con Obesidad',                                             unidad: 'N'       },
            { numero: 23, nombre: 'Caries infancia',                                                   unidad: '%'       },
            { numero: 24, nombre: 'Estado Dentadura (15 años o más)',                                  unidad: '%'       },
            { numero: 25, nombre: 'Prevalencia de Ansiedad',                                           unidad: '%'       },
            { numero: 26, nombre: 'Consumo de psicotropos',                                            unidad: '%'       },
            { numero: 27, nombre: 'Prevalencia de Demencia',                                           unidad: '%'       },
            { numero: 28, nombre: 'Prevalencia de Trastorno conducta alimentaria (TCA)',               unidad: '%'       },
            { numero: 29, nombre: 'Personas con Trastorno del espectro autista',                       unidad: 'N'       },
            { numero: 30, nombre: 'Personas con Trastorno esquizofrénico',                             unidad: 'N'       },
            { numero: 31, nombre: 'Personas con Trastorno estado ánimo',                               unidad: 'N'       },
            { numero: 32, nombre: 'Personas con Trastorno personalidad y comportamiento adulto',       unidad: 'N'       },
            { numero: 33, nombre: 'Consumo Benzodiacepinas (Nº DDD/TAFE bzd)',                         unidad: 'DDD/TAFE'},
        ]),
    }),

    prevencion: Object.freeze({
        id:     'prevencion',
        nombre: 'Prevención',
        icono:  '💉',
        color:  '#9b59b6',
        fuente: 'INFOWEB',
        indicadores: Object.freeze([
            { numero: 34, nombre: 'Participación cribado cáncer Colorrectal',                                              unidad: '%' },
            { numero: 35, nombre: 'Participación cribado cáncer de Mama',                                                  unidad: '%' },
            { numero: 36, nombre: 'Participación Cribado Cuello Uterino',                                                  unidad: '%' },
            { numero: 37, nombre: 'Captación Precoz Embarazo (<12 semana)',                                                unidad: '%' },
            { numero: 38, nombre: 'Población infantil con cribado de hipoacusia antes del mes de vida',                   unidad: '%' },
            { numero: 39, nombre: 'Población infantil con cribado de displasia de caderas',                               unidad: '%' },
            { numero: 40, nombre: 'Población infantil con 2 exploraciones testiculares en los primeros 6 meses de vida',  unidad: '%' },
            { numero: 41, nombre: 'Cribado de enfermedad metabólica',                                                     unidad: '%' },
            { numero: 42, nombre: 'Población infantil con Test de visión de cerca',                                        unidad: '%' },
            { numero: 43, nombre: 'Cobertura Primovacunación',                                                            unidad: '%' },
            { numero: 44, nombre: 'Porcentaje vacunación completa',                                                       unidad: '%' },
            { numero: 45, nombre: 'Cobertura vacunación Triple Vírica (2 dosis)',                                         unidad: '%' },
            { numero: 46, nombre: 'Cobertura DTPa-VPI/Tdpa 6 años',                                                      unidad: '%' },
            { numero: 47, nombre: 'Cobertura VPH a los 12 años',                                                         unidad: '%' },
            { numero: 48, nombre: 'Cobertura vacunal gripe 65 y más años',                                               unidad: '%' },
            { numero: 49, nombre: 'Cobertura neumococo adultos',                                                          unidad: '%' },
            { numero: 50, nombre: 'Cobertura covid',                                                                      unidad: '%' },
        ]),
    }),
});

/** Total de indicadores en el CMI. Constante de dominio (= TOTAL_INDICADORES_MANDOS del monolito). */
export const TOTAL_INDICADORES_CMI = 50;

/** Índice plano num → {numero, nombre, unidad, categoriaId} para búsqueda O(1). */
export const INDICE_INDICADORES = Object.freeze(
    Object.values(CATALOGO_CMI).reduce((acc, cat) => {
        cat.indicadores.forEach(ind => {
            acc[ind.numero] = Object.freeze({ ...ind, categoriaId: cat.id });
        });
        return acc;
    }, {})
);

// ─────────────────────────────────────────────────────────────────────────────
// SEMÁFORO DE INDICADOR
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Valores posibles del semáforo de un indicador CMI.
 */
export const SEMAFORO_INDICADOR = Object.freeze({
    FAVORABLE:  'favorable',   // tendencia observada === tendencia deseada
    A_MEJORAR:  'amejorar',    // tendencias opuestas (problema)
    ESTABLE:    'estable',     // tendencia observada no es clara pero no opuesta
    SIN_DATOS:  'sin_datos',   // no hay tendencias registradas
});

/**
 * Normaliza los valores de tendencia al formato canónico.
 * Acepta tanto símbolos (▲ ▼) como texto ('ascendente', 'descendente').
 * @param {string} t
 * @returns {'ascendente'|'descendente'|'estable'|''}
 * @private
 */
function _normalizarTendencia(t) {
    if (!t) return '';
    const s = String(t).trim().toLowerCase();
    if (s === '▲' || s === '↑' || s === 'ascendente' || s === 'sube') return 'ascendente';
    if (s === '▼' || s === '↓' || s === 'descendente' || s === 'baja') return 'descendente';
    if (s === '→' || s === 'estable')                                   return 'estable';
    return s;
}

/**
 * Calcula el semáforo de un indicador a partir de sus tendencias.
 * Formaliza la lógica dispersa en generarCuadroMandosIntegral() (HTML l.4854).
 *
 * @param {string} tendenciaObservada
 * @param {string} tendenciaDeseada
 * @returns {string} Valor de SEMAFORO_INDICADOR
 */
export function calcularSemaforo(tendenciaObservada, tendenciaDeseada) {
    const tObs = _normalizarTendencia(tendenciaObservada);
    const tDes = _normalizarTendencia(tendenciaDeseada);
    if (!tObs || !tDes) return SEMAFORO_INDICADOR.SIN_DATOS;
    if (tObs === tDes)  return SEMAFORO_INDICADOR.FAVORABLE;

    const opuestas = (tObs === 'ascendente' && tDes === 'descendente') ||
                     (tObs === 'descendente' && tDes === 'ascendente');
    if (opuestas) return SEMAFORO_INDICADOR.A_MEJORAR;

    return SEMAFORO_INDICADOR.ESTABLE;
}

// ─────────────────────────────────────────────────────────────────────────────
// ENTIDAD: IndicadorCMI
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Crea un IndicadorCMI inmutable que combina la definición del catálogo
 * con los datos observados del municipio.
 *
 * @param {object} datos
 * @param {number}  datos.numero              - Número del indicador (1-50)
 * @param {string}  [datos.valor]             - Valor observado (puede ser nulo)
 * @param {string}  [datos.tendenciaObservada]
 * @param {string}  [datos.tendenciaDeseada]
 * @param {string}  [datos.fechaObservacion]  - ISO date de cuándo se midió
 * @param {Array}   [datos.serie]             - Serie temporal [{fecha, valor}]
 * @returns {Readonly<object>} IndicadorCMI inmutable
 */
export function crearIndicadorCMI({
    numero,
    valor             = null,
    tendenciaObservada = '',
    tendenciaDeseada  = '',
    fechaObservacion  = null,
    serie             = [],
} = {}) {
    if (!numero || !INDICE_INDICADORES[numero]) {
        throw new Error(`[IndicadorCMI] Número de indicador inválido: ${numero}. Debe ser 1-50.`);
    }

    const def      = INDICE_INDICADORES[numero];
    const semaforo = calcularSemaforo(tendenciaObservada, tendenciaDeseada);
    const tObsNorm = _normalizarTendencia(tendenciaObservada);
    const tDesNorm = _normalizarTendencia(tendenciaDeseada);
    const tieneDatos = valor !== null && valor !== undefined && valor !== '';

    return Object.freeze({
        // ── Definición del catálogo ────────────────────────────────────────
        numero,
        nombre:      def.nombre,
        unidad:      def.unidad,
        categoriaId: def.categoriaId,

        // ── Datos observados ───────────────────────────────────────────────
        valor:             tieneDatos ? valor : null,
        tendenciaObservada: tObsNorm,
        tendenciaDeseada:   tDesNorm,
        fechaObservacion,

        // ── Serie temporal (cuando existe) ────────────────────────────────
        serie: Object.freeze([...(serie || [])]),
        tieneSerie: Array.isArray(serie) && serie.length > 0,

        // ── Estado derivado ────────────────────────────────────────────────
        semaforo,
        tieneDatos,
        esFavorable: semaforo === SEMAFORO_INDICADOR.FAVORABLE,
        esAMejorar:  semaforo === SEMAFORO_INDICADOR.A_MEJORAR,

        toString() {
            return `IndicadorCMI(${this.numero} "${this.nombre.slice(0,40)}" [${this.semaforo}])`;
        },
        toJSON() {
            return {
                numero, nombre: def.nombre, unidad: def.unidad, categoriaId: def.categoriaId,
                valor: this.valor, tendenciaObservada: tObsNorm, tendenciaDeseada: tDesNorm,
                semaforo, tieneDatos,
            };
        },
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// ENTIDAD: CuadroMandosIntegral
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Crea la entidad CuadroMandosIntegral inmutable.
 *
 * El CMI reúne los 50 IndicadorCMI del territorio y calcula:
 *   - Estadísticas de cobertura (cuántos tienen datos)
 *   - Estadísticas de tendencia (cuántos son favorables)
 *   - Componente CI del ISS (% indicadores favorables con tendencias)
 *   - Series temporales cuando las acciones han registrado progreso
 *
 * @param {object}  datos
 * @param {string}  datos.ambitoId           - Referencia al AmbitoTerritorial
 * @param {string}  [datos.planTerritorialId] - Referencia al PlanTerritorial activo
 * @param {Readonly<object>[]} datos.indicadores - Array de IndicadorCMI (resultado de crearIndicadorCMI)
 * @param {string}  [datos.fechaActualizacion] - Cuándo se cargaron estos datos
 * @param {object}  [datos.metadatos]
 *
 * @returns {Readonly<object>} CuadroMandosIntegral inmutable
 */
export function crearCuadroMandosIntegral({
    ambitoId,
    planTerritorialId = null,
    indicadores       = [],
    fechaActualizacion = null,
    metadatos         = {},
} = {}) {
    if (!ambitoId) {
        throw new Error('[CuadroMandosIntegral] "ambitoId" es obligatorio.');
    }

    const id = `${ambitoId}__cmi${planTerritorialId ? `__${planTerritorialId}` : ''}`;

    // Calcular estadísticas desde los IndicadorCMI
    const indicadoresConDatos  = indicadores.filter(ind => ind.tieneDatos);
    const indicadoresFavorables = indicadores.filter(ind => ind.esFavorable);
    const indicadoresAMejorar  = indicadores.filter(ind => ind.esAMejorar);
    const indicadoresConTendencias = indicadores.filter(
        ind => ind.tendenciaObservada && ind.tendenciaDeseada
    );

    // Componente CI del ISS (% indicadores con tendencia favorable)
    // Formaliza el cálculo de eval_calcularISS() para el componente de indicadores.
    // ⚠️ PROVISIONAL: El coeficiente exacto del ISS sigue en eval_calcularISS()
    //    del monolito (40% o adaptado según fuentes disponibles).
    //    Este módulo solo calcula la proporción; el ISS completo sigue en el monolito.
    const componenteCI = indicadoresConTendencias.length > 0
        ? Math.round((indicadoresFavorables.length / indicadoresConTendencias.length) * 100)
        : null;

    // Agrupar por categoría
    const porCategoria = {};
    Object.values(CATALOGO_CMI).forEach(cat => {
        const indsCategoria = indicadores.filter(ind => ind.categoriaId === cat.id);
        porCategoria[cat.id] = Object.freeze({
            ...cat,
            indicadores:          Object.freeze(indsCategoria),
            conDatos:             indsCategoria.filter(i => i.tieneDatos).length,
            favorables:           indsCategoria.filter(i => i.esFavorable).length,
            aMejorar:             indsCategoria.filter(i => i.esAMejorar).length,
            coberturaPorc:        indsCategoria.length > 0
                                    ? Math.round((indsCategoria.filter(i => i.tieneDatos).length / indsCategoria.length) * 100)
                                    : 0,
        });
    });

    return Object.freeze({
        // ── Identificación ─────────────────────────────────────────────────
        id,
        ambitoId,
        planTerritorialId,
        fechaActualizacion,

        // ── Los 50 indicadores ─────────────────────────────────────────────
        indicadores: Object.freeze([...indicadores]),

        // ── Agrupación por categoría ───────────────────────────────────────
        porCategoria: Object.freeze(porCategoria),

        // ── Estadísticas globales ──────────────────────────────────────────
        totalIndicadores:    TOTAL_INDICADORES_CMI,
        conDatos:            indicadoresConDatos.length,
        conTendencias:       indicadoresConTendencias.length,
        favorables:          indicadoresFavorables.length,
        aMejorar:            indicadoresAMejorar.length,

        coberturaPorcentaje: Math.round((indicadoresConDatos.length / TOTAL_INDICADORES_CMI) * 100),

        // ── Componente CI del ISS ──────────────────────────────────────────
        //    Porcentaje de indicadores con tendencia favorable sobre el total
        //    con tendencias registradas. Alimenta eval_calcularISS() como CI.
        componenteCI,

        // ── Metadata ───────────────────────────────────────────────────────
        metadatos: Object.freeze({ ...metadatos }),

        toString() {
            return `CuadroMandosIntegral(${this.ambitoId} ${this.conDatos}/${this.totalIndicadores} datos CI=${this.componenteCI ?? 'n/a'}%)`;
        },
        toJSON() {
            return {
                id, ambitoId, planTerritorialId, fechaActualizacion,
                totalIndicadores: TOTAL_INDICADORES_CMI,
                conDatos: indicadoresConDatos.length,
                favorables: indicadoresFavorables.length,
                aMejorar: indicadoresAMejorar.length,
                componenteCI,
            };
        },
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// BRIDGES DESDE FORMATO HEREDADO
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Construye un IndicadorCMI desde el formato que Firebase almacena.
 * Firebase guarda: { dato|valor, tendenciaObservada|tObs, tendenciaDeseada|tDes, nombre?, indicador? }
 *
 * @param {number} numero      - Número del indicador (1-50)
 * @param {object} datoFirebase - Objeto del nodo Firebase
 * @returns {Readonly<object>} IndicadorCMI
 */
export function indicadorDesdeFirebase(numero, datoFirebase) {
    if (!datoFirebase || typeof datoFirebase !== 'object') {
        return crearIndicadorCMI({ numero });
    }
    return crearIndicadorCMI({
        numero,
        valor:             datoFirebase.dato  || datoFirebase.valor || null,
        tendenciaObservada: datoFirebase.tendenciaObservada || datoFirebase.tObs || '',
        tendenciaDeseada:   datoFirebase.tendenciaDeseada   || datoFirebase.tDes || '',
    });
}

/**
 * Construye un CuadroMandosIntegral completo desde el mapa de indicadores
 * almacenado en Firebase (`estrategias/{est}/municipios/{mun}/indicadores`).
 *
 * Este es el bridge principal para crear el CMI desde el sistema heredado.
 * Equivalente modular a la parte de datos de `generarCuadroMandosIntegral()`.
 *
 * @param {object|null} datosIndicadores  - Mapa num → dato (puede ser null si no hay datos)
 * @param {string}      ambitoId
 * @param {string}      [planTerritorialId]
 * @returns {Readonly<object>} CuadroMandosIntegral
 */
export function cuadroMandosDesdeFirebase(datosIndicadores, ambitoId, planTerritorialId = null) {
    // Construir los 50 IndicadorCMI — siempre todos, con o sin datos
    const indicadores = Array.from({ length: TOTAL_INDICADORES_CMI }, (_, i) => {
        const num  = i + 1;
        const dato = datosIndicadores ? datosIndicadores[num] : null;
        return indicadorDesdeFirebase(num, dato);
    });

    return crearCuadroMandosIntegral({
        ambitoId,
        planTerritorialId,
        indicadores,
        fechaActualizacion: new Date().toISOString(),
    });
}

/**
 * Construye un CuadroMandosIntegral desde el objeto `datosMunicipioActual`
 * del monolito (la variable global que carga cargarDatosMunicipioFirebase).
 *
 * @param {object|null} datosMunicipio   - window.datosMunicipioActual
 * @param {string}      ambitoId         - Puede obtenerse desde contextoTerritorial
 * @param {string}      [planTerritorialId]
 * @returns {Readonly<object>} CuadroMandosIntegral
 */
export function cuadroMandosDesdeGlobal(datosMunicipio, ambitoId, planTerritorialId = null) {
    const datosInd = datosMunicipio && datosMunicipio.indicadores
        ? datosMunicipio.indicadores
        : null;
    return cuadroMandosDesdeFirebase(datosInd, ambitoId, planTerritorialId);
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS DE CONSULTA
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Devuelve los indicadores favorables de un CMI.
 * Equivalente modular al array `indicadoresFavorables` que construye
 * `analizarDatosMunicipio()` (HTML l.24642-24658).
 */
export function getIndicadoresFavorables(cmi) {
    return (cmi && cmi.indicadores)
        ? cmi.indicadores.filter(i => i.esFavorable)
        : [];
}

/**
 * Devuelve los indicadores a mejorar de un CMI.
 */
export function getIndicadoresAMejorar(cmi) {
    return (cmi && cmi.indicadores)
        ? cmi.indicadores.filter(i => i.esAMejorar)
        : [];
}

/**
 * Devuelve los indicadores de una categoría específica.
 * @param {Readonly<object>} cmi
 * @param {'determinantes'|'eventos_no_transmisibles'|'prevencion'} categoriaId
 */
export function getIndicadoresPorCategoria(cmi, categoriaId) {
    return cmi && cmi.porCategoria && cmi.porCategoria[categoriaId]
        ? cmi.porCategoria[categoriaId].indicadores
        : [];
}

/**
 * Devuelve el componente CI del ISS para este CMI.
 * Listo para ser consumido por evaluación sin depender del monolito.
 *
 * @param {Readonly<object>} cmi
 * @returns {number|null} Porcentaje 0-100, o null si no hay datos de tendencia
 */
export function getComponenteCI(cmi) {
    return cmi ? cmi.componenteCI : null;
}

/**
 * Devuelve un resumen compacto de diagnóstico del CMI.
 * Consumible por el motor de análisis o por documentación.
 *
 * @param {Readonly<object>} cmi
 * @returns {object}
 */
export function resumenDiagnostico(cmi) {
    if (!cmi) return { disponible: false };
    return {
        disponible:          true,
        ambitoId:            cmi.ambitoId,
        totalIndicadores:    cmi.totalIndicadores,
        conDatos:            cmi.conDatos,
        coberturaPorcentaje: cmi.coberturaPorcentaje,
        favorables:          cmi.favorables,
        aMejorar:            cmi.aMejorar,
        componenteCI:        cmi.componenteCI,
        porCategoria: Object.fromEntries(
            Object.entries(cmi.porCategoria || {}).map(([id, cat]) => [id, {
                nombre: cat.nombre,
                conDatos: cat.conDatos,
                favorables: cat.favorables,
                aMejorar: cat.aMejorar,
            }])
        ),
    };
}
