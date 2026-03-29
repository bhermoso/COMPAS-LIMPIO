/**
 * COMPÁS — Entidad de dominio: Ámbito Territorial
 * dominio/ambitoTerritorial.js
 *
 * ITERACIÓN 3 — Modelo explícito del ámbito territorial.
 *
 * Este módulo formaliza los tres tipos de ámbito que el sistema soporta.
 * Antes de esta iteración no existía distinción de tipo en el código:
 * todos los territorios se trataban como un string clave ("padul", etc.)
 * sin modelo explícito de qué clase de entidad territorial eran.
 *
 * RESPONSABILIDADES DE ESTE MÓDULO:
 *   - Definir los tipos de ámbito como constantes nombradas
 *   - Proveer una factory inmutable para crear entidades AmbitoTerritorial
 *   - Proveer predicados y helpers sobre la entidad
 *   - Proveer bridge desde el formato heredado de core/contextoTerritorial.js
 *   - NO acceder al DOM, NO acceder a Firebase, NO tener efectos secundarios
 *
 * MÓDULO PURO: Sin imports de DOM. Sin imports de Firebase.
 * Puede importarse desde cualquier capa sin efectos secundarios.
 *
 * COMPATIBILIDAD TEMPORAL:
 *   - El monolito usa claves string crudas (getMunicipioActual() → 'padul')
 *   - Este módulo NO reemplaza esas claves todavía
 *   - Convivencia: core/contextoTerritorial.js produce { key, nombre, tipo, estrategia }
 *     y este módulo enriquece ese objeto como entidad de dominio
 */

// ─────────────────────────────────────────────────────────────────────────────
// TIPOS DE ÁMBITO TERRITORIAL
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Tipos posibles de ámbito territorial en el sistema.
 *
 * MUNICIPIO: entidad municipal autónoma. La mayoría de los territorios del sistema.
 *
 * MANCOMUNIDAD: agrupación voluntaria de municipios para prestar servicios comunes.
 *   En el sistema actual: 'mancomunidad-alhama' y 'mancomunidad-lecrin'.
 *   Regla de dominio: el plan de una mancomunidad aplica a todos sus municipios miembro.
 *
 * DISTRITO_MUNICIPAL: subdivisión administrativa de un municipio grande (Granada capital).
 *   En el sistema actual: 'granada-albaicin', 'granada-beiro', etc. (8 distritos).
 *   Regla de dominio: los distritos comparten municipio padre pero tienen planes independientes.
 *
 * No existe jerarquía funcional entre los tres tipos (ver ARQUITECTURA_OBJETIVO.md).
 */
export const TIPOS_AMBITO = Object.freeze({
    MUNICIPIO:          'municipio',
    MANCOMUNIDAD:       'mancomunidad',
    DISTRITO_MUNICIPAL: 'distrito_municipal',
});

/** Lista de tipos válidos para validación. */
const _TIPOS_VALIDOS = new Set(Object.values(TIPOS_AMBITO));

// ─────────────────────────────────────────────────────────────────────────────
// VALIDACIÓN
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Valida los datos de entrada antes de crear un AmbitoTerritorial.
 * Lanza Error si los datos son insuficientes o incorrectos.
 * @private
 */
function _validar({ id, nombre, tipo }) {
    if (!id || typeof id !== 'string' || id.trim() === '') {
        throw new Error(`[AmbitoTerritorial] El campo "id" es obligatorio y debe ser un string no vacío. Recibido: ${JSON.stringify(id)}`);
    }
    if (!nombre || typeof nombre !== 'string') {
        throw new Error(`[AmbitoTerritorial] El campo "nombre" es obligatorio. Recibido: ${JSON.stringify(nombre)}`);
    }
    if (!_TIPOS_VALIDOS.has(tipo)) {
        throw new Error(`[AmbitoTerritorial] El campo "tipo" debe ser uno de ${[..._TIPOS_VALIDOS].join(', ')}. Recibido: ${JSON.stringify(tipo)}`);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// ENTIDAD
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Crea una entidad AmbitoTerritorial inmutable.
 *
 * @param {object} datos
 * @param {string}  datos.id          - Clave única del territorio (ej: 'padul', 'mancomunidad-alhama')
 * @param {string}  datos.nombre      - Nombre legible (ej: 'Padul', 'Mancomunidad de Alhama de Granada')
 * @param {string}  datos.tipo        - Uno de TIPOS_AMBITO (municipio | mancomunidad | distrito_municipal)
 * @param {string}  [datos.estrategia] - ID de la estrategia de salud asociada
 * @param {object}  [datos.metadata]  - Datos adicionales libres (poblacion, comarca, etc.)
 *
 * @returns {Readonly<object>} Entidad AmbitoTerritorial inmutable
 * @throws {Error} Si los datos obligatorios son inválidos
 */
export function crearAmbitoTerritorial({
    id,
    nombre,
    tipo,
    estrategia = 'es-andalucia-epvsa',
    metadata = {},
} = {}) {
    _validar({ id, nombre, tipo });

    return Object.freeze({
        // ── Identificación ─────────────────────────────────────────────────
        id,
        nombre,
        tipo,
        estrategia,
        metadata: Object.freeze({ ...metadata }),

        // ── Predicados de tipo (conveniencia) ──────────────────────────────
        esMunicipio:         tipo === TIPOS_AMBITO.MUNICIPIO,
        esMancomunidad:      tipo === TIPOS_AMBITO.MANCOMUNIDAD,
        esDistritoMunicipal: tipo === TIPOS_AMBITO.DISTRITO_MUNICIPAL,

        // ── Representación canónica ────────────────────────────────────────
        toString() {
            return `AmbitoTerritorial(${this.id} [${this.tipo}])`;
        },
        toJSON() {
            return { id, nombre, tipo, estrategia, metadata };
        },
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// BRIDGES DESDE FORMATOS HEREDADOS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Crea un AmbitoTerritorial desde el formato producido por core/contextoTerritorial.js.
 * El formato de contextoTerritorial es: { key, nombre, tipo, estrategia }
 * Este bridge normaliza ese objeto al modelo de dominio.
 *
 * @param {{ key: string, nombre: string, tipo: string, estrategia: string }} contexto
 * @returns {Readonly<object>|null} AmbitoTerritorial, o null si el contexto es nulo/vacío
 */
export function ambitoDesdeContexto(contexto) {
    if (!contexto || !contexto.key) return null;
    return crearAmbitoTerritorial({
        id:        contexto.key,
        nombre:    contexto.nombre || contexto.key,
        tipo:      _TIPOS_VALIDOS.has(contexto.tipo) ? contexto.tipo : TIPOS_AMBITO.MUNICIPIO,
        estrategia: contexto.estrategia || 'es-andalucia-epvsa',
    });
}

/**
 * Crea un AmbitoTerritorial desde los datos crudos de Firebase de un municipio.
 * Firebase almacena { nombre, ... } bajo estrategias/{est}/municipios/{mun}.
 * La clave de la ruta (mun) es el id del ámbito.
 *
 * @param {string} key     - Clave del municipio (ej: 'padul')
 * @param {object} datos   - Datos cargados de Firebase (puede incluir .nombre)
 * @param {string} [estrategia]
 * @returns {Readonly<object>}
 */
export function ambitoDesdeFirebase(key, datos = {}, estrategia = 'es-andalucia-epvsa') {
    const nombre = (datos && datos.nombre) ? datos.nombre : key;
    // Derivar tipo desde la clave (misma lógica que contextoTerritorial.js)
    let tipo = TIPOS_AMBITO.MUNICIPIO;
    if (key.startsWith('mancomunidad-')) tipo = TIPOS_AMBITO.MANCOMUNIDAD;
    else if (key.startsWith('granada-'))   tipo = TIPOS_AMBITO.DISTRITO_MUNICIPAL;
    return crearAmbitoTerritorial({ id: key, nombre, tipo, estrategia });
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compara dos ámbitos por identidad de id.
 * @param {object} a
 * @param {object} b
 * @returns {boolean}
 */
export function sonMismoAmbito(a, b) {
    if (!a || !b) return false;
    return a.id === b.id;
}

/**
 * Agrupa un array de AmbitoTerritorial por tipo.
 * @param {object[]} ambitos
 * @returns {{ municipio: object[], mancomunidad: object[], distrito_municipal: object[] }}
 */
export function agruparPorTipo(ambitos) {
    return (ambitos || []).reduce((acc, a) => {
        const tipo = a.tipo || TIPOS_AMBITO.MUNICIPIO;
        if (!acc[tipo]) acc[tipo] = [];
        acc[tipo].push(a);
        return acc;
    }, {
        [TIPOS_AMBITO.MUNICIPIO]:          [],
        [TIPOS_AMBITO.MANCOMUNIDAD]:       [],
        [TIPOS_AMBITO.DISTRITO_MUNICIPAL]: [],
    });
}
