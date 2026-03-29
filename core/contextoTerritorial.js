/**
 * COMPÁS — Contexto territorial activo
 * core/contextoTerritorial.js
 *
 * ITERACIÓN 2 — Capa de abstracción sobre el ámbito territorial.
 *
 * Este módulo centraliza la pregunta "¿qué territorio está activo ahora?".
 * Antes de esta iteración esa pregunta tenía una sola respuesta posible:
 *   document.getElementById('municipio').value
 * … dependencia directa del DOM que no puede ser consultada desde módulos
 * sin contexto de interfaz.
 *
 * Lo que hace este módulo:
 *   1. Lee el territorio activo del DOM (en init y en cambio) y lo publica
 *      en estadoGlobal como { key, nombre, tipo, estrategia }
 *   2. Formaliza la derivación del TIPO de territorio desde el prefijo de clave
 *      (regla implícita que antes no existía como código explícito)
 *   3. Expone getAmbitoActivo() que NO depende del DOM — usa estadoGlobal
 *      como fuente canónica con fallback al DOM para compatibilidad
 *   4. Registra un listener ADITIVO en #municipio (no reemplaza el heredado)
 *   5. NO interfiere con actualizarMunicipio() ni con su cadena de efectos
 *
 * COMPATIBILIDAD TEMPORAL:
 *   - actualizarMunicipio() sigue funcionando exactamente igual (HTML l.7770)
 *   - getMunicipioActual() sigue existiendo y sigue leyendo del DOM
 *   - TERRITORIOS y estrategiaActual siguen en el monolito
 *   - Este módulo solo AÑADE, no REEMPLAZA
 *
 * SECUENCIA DE EJECUCIÓN:
 *   1. HTML <script> clásico: registra listener heredado en #municipio (l.13159)
 *      que llama a actualizarMunicipio()
 *   2. main.js (módulo ES): llama a initContextoTerritorial()
 *   3. initContextoTerritorial(): registra SEGUNDO listener en #municipio
 *      (solo sincroniza estadoGlobal, no dispara actualizarMunicipio otra vez)
 *
 * Cuando el usuario cambia el selector:
 *   → Listener 1 (heredado): actualizarMunicipio() → carga Firebase, resetea estado
 *   → Listener 2 (este módulo): setAmbitoActivo() → actualiza estadoGlobal
 */

import { setAmbitoActivo, get } from './estadoGlobal.js';

// ─────────────────────────────────────────────────────────────────────────────
// DERIVACIÓN DE TIPO TERRITORIAL
// (formalización de regla implícita — ver LISTA_HARDCODING.md H03)
//
// Las claves del sistema TERRITORIOS siguen un patrón semántico:
//   'mancomunidad-*'  → 'mancomunidad'
//   'granada-*'       → 'distrito_municipal'  (distritos urbanos de la capital)
//   resto             → 'municipio'
//
// Esta regla era implícita en el sistema heredado (todos los territorios
// se trataban igual en el código). Se formaliza aquí como primer paso
// hacia la distinción de tipo en la lógica de dominio.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Mapeo de prefijos de clave → tipo de territorio.
 * Añadir nuevos prefijos aquí si se incorporan nuevos tipos de ámbito.
 */
const PREFIJOS_TIPO = [
    { prefijo: 'mancomunidad-', tipo: 'mancomunidad' },
    { prefijo: 'granada-',      tipo: 'distrito_municipal' },
];

/**
 * Deriva el tipo de territorio a partir de la clave.
 * @param {string} key
 * @returns {'municipio'|'mancomunidad'|'distrito_municipal'}
 */
function _derivarTipo(key) {
    if (!key) return null;
    for (const { prefijo, tipo } of PREFIJOS_TIPO) {
        if (key.startsWith(prefijo)) return tipo;
    }
    return 'municipio';
}

// ─────────────────────────────────────────────────────────────────────────────
// RESOLUCIÓN DE NOMBRE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resuelve el nombre legible de un territorio a partir de su clave.
 * Prioriza la función heredada getNombreMunicipio() si está disponible.
 * Fallback: búsqueda directa en TERRITORIOS.
 *
 * @param {string} key
 * @returns {string}
 */
function _resolverNombre(key) {
    if (!key) return '';
    // Función heredada del monolito (l.~7584 del HTML)
    if (typeof getNombreMunicipio === 'function') {
        const nombre = getNombreMunicipio(key);
        if (nombre) return nombre;
    }
    // Fallback: buscar en la constante TERRITORIOS si está disponible
    if (typeof TERRITORIOS !== 'undefined') {
        const estId = typeof estrategiaActual !== 'undefined'
            ? estrategiaActual
            : 'es-andalucia-epvsa';
        const lista = TERRITORIOS[estId];
        if (lista && lista.items) {
            const item = lista.items.find(t => t.value === key);
            if (item) return item.nombre;
        }
    }
    // Último recurso: devolver la clave sin transformar
    return key;
}

// ─────────────────────────────────────────────────────────────────────────────
// API PÚBLICA
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Construye el objeto de ámbito normalizado a partir de una clave.
 * No modifica el estado; solo construye el objeto.
 *
 * @param {string} key
 * @returns {{ key: string, nombre: string, tipo: string, estrategia: string }|null}
 */
export function buildAmbitoDesdeKey(key) {
    if (!key) return null;
    const estrategia = typeof estrategiaActual !== 'undefined'
        ? estrategiaActual
        : 'es-andalucia-epvsa';
    return {
        key,
        nombre:    _resolverNombre(key),
        tipo:      _derivarTipo(key),
        estrategia,
    };
}

/**
 * Devuelve el ámbito territorial activo SIN depender directamente del DOM.
 *
 * Orden de resolución:
 *   1. estadoGlobal (fuente modular canónica, ya sincronizada por el listener)
 *   2. window.COMPAS.__ambitoActivo (puente bridge)
 *   3. DOM — document.getElementById('municipio').value (fallback heredado)
 *
 * @returns {{ key, nombre, tipo, estrategia }|null}
 */
export function getAmbitoActivo() {
    // 1. Fuente modular (estadoGlobal)
    const ambitoEstado = get('ambitoTerritorialActivo');
    if (ambitoEstado) return ambitoEstado;

    // 2. Bridge window.COMPAS
    if (window.COMPAS && window.COMPAS.__ambitoActivo) {
        return window.COMPAS.__ambitoActivo;
    }

    // 3. Fallback DOM (compatible con sistema heredado)
    const selectEl = document.getElementById('municipio');
    const key = selectEl ? selectEl.value : null;
    if (!key) return null;

    // Construir y cachear en estadoGlobal para próximas llamadas
    const ambito = buildAmbitoDesdeKey(key);
    setAmbitoActivo(ambito);
    return ambito;
}

/**
 * Shorthand: ¿hay un territorio activo seleccionado?
 * @returns {boolean}
 */
export function hayAmbitoActivo() {
    const a = getAmbitoActivo();
    return !!(a && a.key);
}

/**
 * Shorthand: devuelve el tipo del territorio activo.
 * @returns {'municipio'|'mancomunidad'|'distrito_municipal'|null}
 */
export function getTipoTerritorio() {
    const a = getAmbitoActivo();
    return a ? a.tipo : null;
}

/**
 * Devuelve todos los territorios disponibles para la estrategia activa,
 * enriquecidos con el tipo derivado.
 * Fuente: constante TERRITORIOS del monolito (sin depender del DOM del selector).
 *
 * @returns {{ key: string, nombre: string, tipo: string }[]}
 */
export function getTerritoriosDisponibles() {
    if (typeof TERRITORIOS === 'undefined') return [];
    const estId = typeof estrategiaActual !== 'undefined'
        ? estrategiaActual
        : 'es-andalucia-epvsa';
    const t = TERRITORIOS[estId];
    if (!t || !t.items) return [];
    return t.items.map(item => ({
        key:    item.value,
        nombre: item.nombre,
        tipo:   _derivarTipo(item.value),
    }));
}

/**
 * Devuelve los territorios disponibles agrupados por tipo.
 * Util para selectores y filtros de territorio.
 *
 * @returns {{ municipio: [], mancomunidad: [], distrito_municipal: [] }}
 */
export function getTerritoriosAgrupados() {
    const todos = getTerritoriosDisponibles();
    return todos.reduce((acc, t) => {
        const tipo = t.tipo || 'municipio';
        if (!acc[tipo]) acc[tipo] = [];
        acc[tipo].push(t);
        return acc;
    }, { municipio: [], mancomunidad: [], distrito_municipal: [] });
}

// ─────────────────────────────────────────────────────────────────────────────
// INICIALIZACIÓN
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Inicializa el contexto territorial.
 * Llamar desde core/main.js, después de initEstadoGlobal().
 *
 * Efectos:
 *  1. Lee el territorio seleccionado al arrancar y lo publica en estadoGlobal
 *  2. Registra un listener ADITIVO en #municipio (no reemplaza el heredado)
 *  3. Expone la API en window.COMPAS.__contextoTerritorial (puente)
 */
export function initContextoTerritorial() {
    const selectEl = document.getElementById('municipio');

    // 1. Sincronizar estado inicial
    if (selectEl && selectEl.value) {
        const ambitoInicial = buildAmbitoDesdeKey(selectEl.value);
        setAmbitoActivo(ambitoInicial);
        console.log('[contextoTerritorial] Ámbito inicial:', ambitoInicial.key,
            '/', ambitoInicial.nombre, '/', ambitoInicial.tipo);
    } else {
        console.log('[contextoTerritorial] Sin ámbito inicial (ningún territorio seleccionado).');
    }

    // 2. Listener ADITIVO en el selector de municipio
    //
    //    El listener heredado (HTML l.13159) ya hace:
    //      → actualizarMunicipio()   — carga Firebase, resetea estado
    //      → verificarAccesoFase6()  — bloquea/desbloquea tab
    //    Este listener solo sincroniza el estado modular. No llama a
    //    actualizarMunicipio() otra vez; no interfiere con el flujo heredado.
    if (selectEl) {
        selectEl.addEventListener('change', function _contextoListener() {
            const key = this.value;
            const ambito = key ? buildAmbitoDesdeKey(key) : null;
            setAmbitoActivo(ambito);
            if (ambito) {
                console.log('[contextoTerritorial] Cambio de ámbito:',
                    ambito.key, '/', ambito.nombre, '/', ambito.tipo);
            } else {
                console.log('[contextoTerritorial] Ámbito borrado (sin selección).');
            }
        });
        console.log('[contextoTerritorial] Listener aditivo registrado en #municipio.');
    } else {
        console.warn('[contextoTerritorial] No se encontró #municipio en el DOM.');
    }

    // 3. Exponer API en window.COMPAS para código heredado que no puede hacer imports ES
    if (window.COMPAS) {
        window.COMPAS.__contextoTerritorial = {
            getAmbitoActivo,
            hayAmbitoActivo,
            getTipoTerritorio,
            getTerritoriosDisponibles,
            getTerritoriosAgrupados,
            buildAmbitoDesdeKey,
        };
    }

    console.log('[contextoTerritorial] Inicializado.',
        getTerritoriosDisponibles().length, 'territorios disponibles.');
}
