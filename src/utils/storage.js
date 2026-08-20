const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../../data');
const GUILDS_DIR = path.join(DATA_DIR, 'guilds');

// Asegurar que existan las carpetas de datos
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(GUILDS_DIR)) fs.mkdirSync(GUILDS_DIR, { recursive: true });

// Caché en memoria RAM de datos por servidor
const memoryCache = new Map();
const saveTimers = new Map();

/**
 * Obtiene la ruta del archivo JSON de datos de un servidor.
 */
function getGuildFilePath(guildId) {
    return path.join(GUILDS_DIR, `${guildId}.json`);
}

/**
 * Lee los datos de un servidor desde disco o caché.
 * @param {string} guildId 
 * @returns {object}
 */
function loadGuildData(guildId) {
    if (memoryCache.has(guildId)) {
        return memoryCache.get(guildId);
    }

    const filePath = getGuildFilePath(guildId);
    let data = {};

    if (fs.existsSync(filePath)) {
        try {
            const raw = fs.readFileSync(filePath, 'utf8');
            data = JSON.parse(raw);
        } catch (err) {
            console.error(`[STORAGE-ERR] Error al leer ${filePath}:`, err.message);
            data = {};
        }
    }

    memoryCache.set(guildId, data);
    return data;
}

/**
 * Guarda los datos de un servidor en disco (debounced para evitar saturación de I/O).
 * @param {string} guildId 
 * @param {object} data 
 * @param {boolean} [immediate=false] 
 */
function saveGuildData(guildId, data, immediate = false) {
    memoryCache.set(guildId, data);

    const doSave = () => {
        const filePath = getGuildFilePath(guildId);
        try {
            data.updatedAt = new Date().toISOString();
            fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
        } catch (err) {
            console.error(`[STORAGE-ERR] Error al guardar ${filePath}:`, err.message);
        }
    };

    if (immediate) {
        doSave();
        return;
    }

    // Debounce de 3 segundos para reducir escritura en disco
    if (saveTimers.has(guildId)) {
        clearTimeout(saveTimers.get(guildId));
    }

    const timer = setTimeout(() => {
        doSave();
        saveTimers.delete(guildId);
    }, 3000);

    saveTimers.set(guildId, timer);
}

module.exports = {
    loadGuildData,
    saveGuildData
};
