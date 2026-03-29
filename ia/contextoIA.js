/**
 * COMPÁS — Constructor del Contexto IA
 * ia/contextoIA.js
 *
 * ITERACIÓN 7 — Capa de construcción de entradas estructuradas para motores IA.
 *
 * PROPÓSITO:
 *   Los motores IA heredados leen datos directamente de variables globales
 *   (datosMunicipioActual, window.analisisActual, referenciasEAS, etc.).
 *   Este módulo centraliza esa lectura y produce un objeto ContextoIA
 *   estructurado que los motores modulares pueden consumir sin depender del DOM.
 *
 * REGLA ARQUITECTURAL:
 *   "Los motores IA deben recibir entradas estructuradas desde core/dominio/persistencia."
 *   Este módulo ES ese punto de construcción de entradas estructuradas.
 *
 * QUÉ ES UN ContextoIA:
 *   Un snapshot inmutable de todo lo que un motor necesita para ejecutarse:
 *   - El ámbito territorial activo
 *   - Los datos de diagnóstico del municipio
 *   - El cuadro de mandos integral
 *   - Los datos de participación ciudadana
 *   - El análisis previo si existe
 *   - El inventario de fuentes disponibles
 *
 * BRIDGES HACIA EL SISTEMA HEREDADO:
 *   `contextoDesdeGlobalesHeredados()` — lee window.datosMunicipioActual,
 *   window.analisisActual, window.datosParticipacionCiudadana, etc.
 *   Permite que el código heredado pueda crear un ContextoIA sin cambios.
 *
 * MÓDULO: No lee del DOM directamente. Lee de window.* solo como bridge heredado.
 */

import { get as getEstado } from '../core/estadoGlobal.js';
import { getAmbitoActivo } from '../core/contextoTerritorial.js';
import { cuadroMandosDesdeFirebase } from '../dominio/cuadroMandos.js';

// ─────────────────────────────────────────────────────────────────────────────
// FACTORY DE ContextoIA
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Crea un objeto ContextoIA inmutable desde datos explícitos.
 * Este es el constructor canónico; los bridges llaman a esta función.
 *
 * @param {object} datos
 * @param {string}  datos.ambitoId            - Clave del territorio ('padul', etc.)
 * @param {string}  [datos.ambitoNombre]      - Nombre legible del territorio
 * @param {string}  [datos.ambitoTipo]        - 'municipio'|'mancomunidad'|'distrito_municipal'
 * @param {string}  [datos.estrategia]        - ID de estrategia activa
 * @param {string}  [datos.planTerritorialId] - ID del plan activo
 *
 * DATOS DIAGNÓSTICOS:
 * @param {object}  [datos.datosMunicipio]    - Objeto completo del municipio (Firebase raw)
 * @param {object}  [datos.determinantes]     - Mapa código → valor
 * @param {object}  [datos.indicadores]       - Mapa num → {dato, tendencias}
 * @param {object}  [datos.referenciasEAS]    - Valores ref Andalucía/Granada
 * @param {object}  [datos.informe]           - { htmlCompleto, textPlano }
 * @param {object}  [datos.cuadroMandos]      - Entidad CuadroMandosIntegral (si ya está construida)
 *
 * ANÁLISIS Y PARTICIPACIÓN:
 * @param {object}  [datos.analisisPrevio]    - window.analisisActual (análisis v2 anterior)
 * @param {object}  [datos.analisisPrevioV3]  - window.analisisActualV3 (análisis v3 anterior)
 * @param {object}  [datos.participacion]     - Datos normalizados de participación ciudadana
 * @param {Array}   [datos.estudiosComplementarios] - Array de estudios
 *
 * FUENTES:
 * @param {object}  [datos.fuentes]           - Inventario { tieneInforme, tieneDet, ... }
 *                                              Si no se da, se infiere de los datos.
 *
 * @returns {Readonly<object>} ContextoIA inmutable
 */
export function crearContextoIA({
    ambitoId,
    ambitoNombre        = '',
    ambitoTipo          = 'municipio',
    estrategia          = 'es-andalucia-epvsa',
    planTerritorialId   = null,

    // Datos diagnósticos
    datosMunicipio      = {},
    determinantes       = {},
    indicadores         = {},
    referenciasEAS      = {},
    informe             = null,
    cuadroMandos        = null,

    // Análisis y participación
    analisisPrevio      = null,
    analisisPrevioV3    = null,
    participacion       = null,
    estudiosComplementarios = [],

    // Fuentes (se infiere si no se da)
    fuentes             = null,
} = {}) {
    if (!ambitoId) {
        throw new Error('[contextoIA] ambitoId es obligatorio para crear un ContextoIA.');
    }

    // Construir cuadro de mandos si no se dio pero hay indicadores
    const cmiEfectivo = cuadroMandos
        || (Object.keys(indicadores).length > 0
            ? cuadroMandosDesdeFirebase(indicadores, ambitoId, planTerritorialId)
            : null);

    // Inferir fuentes disponibles si no se proporcionaron
    const fuentesEfectivas = fuentes || _inferirFuentes({
        datosMunicipio,
        determinantes,
        indicadores,
        informe,
        participacion,
        estudiosComplementarios,
    });

    return Object.freeze({
        // ── Identidad territorial ──────────────────────────────────────────
        ambitoId,
        ambitoNombre:          ambitoNombre || ambitoId,
        ambitoTipo,
        estrategia,
        planTerritorialId,
        timestamp:             new Date().toISOString(),

        // ── Datos diagnósticos ─────────────────────────────────────────────
        //    Los objetos raw se exponen para que los motores los procesen.
        //    Las entidades de dominio construidas (cmi) se exponen por separado.
        datosMunicipio:        Object.freeze({ ...datosMunicipio }),
        determinantes:         Object.freeze({ ...determinantes }),
        indicadores:           Object.freeze({ ...indicadores }),
        referenciasEAS:        Object.freeze({ ...referenciasEAS }),
        informe,
        cuadroMandos:          cmiEfectivo,

        // ── Análisis y participación ───────────────────────────────────────
        analisisPrevio,          // window.analisisActual (puede ser null)
        analisisPrevioV3,        // window.analisisActualV3 (puede ser null)
        participacion,
        estudiosComplementarios: Object.freeze([...(estudiosComplementarios || [])]),

        // ── Inventario de fuentes ──────────────────────────────────────────
        //    Los motores deben consultar esto para saber con qué pueden trabajar.
        fuentes: Object.freeze(fuentesEfectivas),

        toString() {
            const n = this.fuentes ? Object.values(this.fuentes).filter(Boolean).length : 0;
            return `ContextoIA(${this.ambitoId} [${this.ambitoTipo}] ${n} fuentes)`;
        },
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// INFERENCIA DE FUENTES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Infiere el inventario de fuentes disponibles desde los datos.
 * Equivalente modular de la detección de fuentes en analizarDatosMunicipio() (HTML l.24528).
 * @private
 */
function _inferirFuentes({ datosMunicipio = {}, determinantes = {}, indicadores = {}, informe, participacion, estudiosComplementarios = [] }) {
    const tieneInforme   = !!(informe && informe.htmlCompleto)
                        || !!(datosMunicipio.informe && datosMunicipio.informe.htmlCompleto);
    const tieneEstudios  = Array.isArray(estudiosComplementarios) && estudiosComplementarios.length > 0;
    const tienePopular   = !!(participacion && (participacion.temasFreq || participacion.rankingObjetivos));
    const detData        = determinantes || datosMunicipio.determinantes || {};
    const tieneDet       = Object.keys(detData).length > 0;
    const indData        = indicadores  || datosMunicipio.indicadores  || {};
    const tieneIndicadores = Object.keys(indData).length > 0;

    const nParticipantes = participacion
        ? (participacion.totalParticipantes || participacion.n || 0)
        : 0;

    return {
        tieneInforme,
        tieneEstudios,
        tienePopular,
        tieneDet,
        tieneIndicadores,
        nEstudios:      estudiosComplementarios.length,
        nParticipantes,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// BRIDGES DESDE EL SISTEMA HEREDADO
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Construye un ContextoIA leyendo desde las variables globales del monolito.
 *
 * Este bridge permite crear un ContextoIA modular sin migrar todavía las
 * funciones que cargan los datos (cargarDatosMunicipioFirebase, etc.).
 *
 * Fuentes que lee:
 *   - window.datosMunicipioActual       → datos diagnósticos
 *   - window.analisisActual             → análisis previo v2
 *   - window.analisisActualV3           → análisis previo v3
 *   - window.datosParticipacionCiudadana → participación
 *   - window.estudiosComplementarios    → estudios
 *   - window.referenciasEAS             → referencias EAS
 *   - estadoGlobal / contextoTerritorial → ámbito activo
 *
 * ⚠️ PROVISIONAL: Esta función depende de variables globales del monolito.
 *    Cuando se extraigan las funciones de carga, se sustituirá por la versión
 *    que obtiene los datos desde los repositorios.
 *
 * @returns {Readonly<object>|null} ContextoIA, o null si no hay ámbito activo
 */
export function contextoDesdeGlobalesHeredados() {
    // Leer ámbito desde estadoGlobal/contextoTerritorial (ya modular)
    const ambito = getAmbitoActivo()
        || (window.COMPAS && window.COMPAS.__ambitoActivo)
        || null;

    if (!ambito || !ambito.key) {
        console.warn('[contextoIA] Sin ámbito activo. No se puede construir ContextoIA.');
        return null;
    }

    // Leer datos de las variables globales heredadas
    const datosMunicipio        = (typeof datosMunicipioActual !== 'undefined'            && datosMunicipioActual)           || {};
    const analisisPrevio        = (typeof window !== 'undefined'                           && window.analisisActual)          || null;
    const analisisPrevioV3      = (typeof window !== 'undefined'                           && window.analisisActualV3)        || null;
    const participacion         = (typeof window !== 'undefined'                           && window.datosParticipacionCiudadana) || null;
    const estudiosComplementarios = (typeof window !== 'undefined'                          && window.estudiosComplementarios)|| [];
    const referenciasEASData    = (typeof referenciasEAS !== 'undefined'                   && referenciasEAS)                 || {};

    // Extraer sub-objetos del nodo del municipio
    const determinantes = (datosMunicipio && datosMunicipio.determinantes) || {};
    const indicadores   = (datosMunicipio && datosMunicipio.indicadores)   || {};
    const informe       = (datosMunicipio && datosMunicipio.informe)       || null;

    // Estado del plan desde estadoGlobal si está disponible
    const planActivo = getEstado('planTerritorialActivo');
    const planTerritorialId = planActivo ? planActivo.id : null;

    return crearContextoIA({
        ambitoId:               ambito.key,
        ambitoNombre:           ambito.nombre  || ambito.key,
        ambitoTipo:             ambito.tipo    || 'municipio',
        estrategia:             ambito.estrategia || 'es-andalucia-epvsa',
        planTerritorialId,
        datosMunicipio,
        determinantes,
        indicadores,
        referenciasEAS:         referenciasEASData,
        informe,
        analisisPrevio,
        analisisPrevioV3,
        participacion,
        estudiosComplementarios,
    });
}

/**
 * Construye un ContextoIA desde datos ya cargados como entidades de dominio.
 * Versión futura que no depende de variables globales del monolito.
 *
 * @param {Readonly<object>} ambitoTerritorial  - Entidad AmbitoTerritorial
 * @param {Readonly<object>} planTerritorial    - Entidad PlanTerritorial
 * @param {object} datosMunicipio               - Datos raw cargados desde repositorioPlanes
 * @param {object} [opciones]
 * @param {object} [opciones.participacion]
 * @param {Array}  [opciones.estudios]
 * @param {object} [opciones.referenciasEAS]
 * @returns {Readonly<object>} ContextoIA
 */
export function contextoDesdeEntidades(ambitoTerritorial, planTerritorial, datosMunicipio, opciones = {}) {
    if (!ambitoTerritorial) {
        throw new Error('[contextoIA.contextoDesdeEntidades] ambitoTerritorial es obligatorio.');
    }

    const datos = datosMunicipio || {};
    return crearContextoIA({
        ambitoId:               ambitoTerritorial.id,
        ambitoNombre:           ambitoTerritorial.nombre,
        ambitoTipo:             ambitoTerritorial.tipo,
        estrategia:             ambitoTerritorial.estrategia || 'es-andalucia-epvsa',
        planTerritorialId:      planTerritorial ? planTerritorial.id : null,
        datosMunicipio:         datos,
        determinantes:          datos.determinantes || {},
        indicadores:            datos.indicadores   || {},
        referenciasEAS:         opciones.referenciasEAS || {},
        informe:                datos.informe || null,
        participacion:          opciones.participacion || null,
        estudiosComplementarios: opciones.estudios || [],
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS DE CONSULTA
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Añade el análisis previo (ya existente en window.analisisActual) al contexto.
 * Útil cuando el contexto se creó antes de que el análisis estuviera disponible.
 *
 * @param {Readonly<object>} contextoIA
 * @param {object} analisisPrevio
 * @returns {Readonly<object>} Nuevo ContextoIA con el análisis previo añadido
 */
export function contextoConAnalisisPrevio(contextoIA, analisisPrevio) {
    if (!contextoIA) return null;
    return crearContextoIA({
        ...contextoIA,
        analisisPrevio,
    });
}

/**
 * Devuelve el número de fuentes disponibles en el contexto.
 */
export function contarFuentesDisponibles(contextoIA) {
    if (!contextoIA || !contextoIA.fuentes) return 0;
    const f = contextoIA.fuentes;
    return [f.tieneInforme, f.tieneEstudios, f.tienePopular, f.tieneDet, f.tieneIndicadores]
        .filter(Boolean).length;
}
