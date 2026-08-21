/**
 * Scrappy Bot - Chat Learner Store
 * Modulo de ingesta de mensajes, limpieza de ruido, construcción de matriz de Markov,
 * indice de vocabulario y almacenamiento automático por servidor.
 */

const storage = require('./storage');

const DEFAULT_IGNORED_PATTERNS = [/bot/i, /log/i, /admin/i, /staff/i, /mod/i];
const MAX_MARKOV_STATES = 10000;
const MAX_SAMPLE_PHRASES = 50;
const MAX_RECENT_MESSAGES = 25;

function getDefaultConfig() {
    return {
        enabled: true,
        autoRespond: true,
        autoRespondChance: 0.10, // 10% probabilidad de auto-responder
        mode: "hybrid", // "markov" | "hybrid" | "gemini"
        ignoredChannels: [],
        enabledChannels: [], // Lista de canales activados explícitamente (si está vacía, actúa en todos)
        optedOutUsers: []
    };
}

/**
 * Obtiene los datos de aprendizaje del servidor.
 * @param {string} guildId 
 * @returns {object}
 */
function getGuildLearningData(guildId) {
    const rawData = storage.loadGuildData(guildId);

    if (!rawData.chat_learning) {
        rawData.chat_learning = {
            config: getDefaultConfig(),
            markovChain: {},
            keywords: {},
            userStyles: {},
            recentContext: [],
            totalMessagesIndexed: 0
        };
    }

    // Asegurar estructura
    const cl = rawData.chat_learning;
    cl.config = { ...getDefaultConfig(), ...(cl.config || {}) };
    cl.config.enabledChannels = cl.config.enabledChannels || [];
    cl.markovChain = cl.markovChain || {};
    cl.keywords = cl.keywords || {};
    cl.userStyles = cl.userStyles || {};
    cl.recentContext = cl.recentContext || [];

    return cl;
}

/**
 * Limpia y tokeniza texto eliminando comandos, URLs, menciones y spam.
 * @param {string} text 
 * @returns {string|null}
 */
function cleanAndTokenizeText(text) {
    if (!text || typeof text !== "string") return null;

    let clean = text.trim();

    // 1. Comandos (!, /, ., -, etc.)
    if (/^[!/.\-?$+%#&]/.test(clean)) return null;

    // 2. URLs
    if (/https?:\/\/\S+/i.test(clean) || /discord\.(gg|com\/invite)\/\S+/i.test(clean)) return null;

    // 3. Menciones y Emojis custom
    clean = clean.replace(/<@!?&?\d+>/g, "");
    clean = clean.replace(/<#\d+>/g, "");
    clean = clean.replace(/<a?:\w+:\d+>/g, "");

    // 4. Repeticiones exageradas de letras
    clean = clean.replace(/(.)\1{4,}/gi, "$1$1$1");
    clean = clean.trim();

    const tokens = clean.split(/\s+/).filter(t => t.length > 0);
    if (tokens.length < 1) return null;

    const validWords = tokens.filter(t => /[a-zA-ZáéíóúÁÉÍÓÚñÑ0-9]/.test(t));
    if (validWords.length === 0) return null;

    return clean;
}

/**
 * Ingesta un mensaje de chat para aprender sus patrones.
 * @param {import('discord.js').Message} message 
 */
function ingestMessage(message) {
    if (!message || !message.guild || !message.author || message.author.bot) return false;

    const guildId = message.guild.id;
    const learningData = getGuildLearningData(guildId);
    const config = learningData.config;

    if (!config.enabled) return false;

    // Validar canal activado (si hay canales en enabledChannels, sólo permitir esos)
    if (config.enabledChannels.length > 0 && !config.enabledChannels.includes(message.channel.id)) {
        return false;
    }

    if (config.ignoredChannels.includes(message.channel.id)) return false;
    if (DEFAULT_IGNORED_PATTERNS.some(p => p.test(message.channel.name))) return false;
    if (config.optedOutUsers.includes(message.author.id)) return false;

    const cleanContent = cleanAndTokenizeText(message.content);
    if (!cleanContent) return false;

    const words = cleanContent.split(/\s+/);
    if (words.length === 0) return false;

    // 1. Matriz de Markov (2-gram)
    const chain = learningData.markovChain;

    const startKey = `__START__ ${words[0].toLowerCase()}`;
    if (!chain[startKey]) chain[startKey] = [];
    if (words[1]) chain[startKey].push(words[1].toLowerCase());

    for (let i = 0; i < words.length; i++) {
        const w1 = words[i].toLowerCase();
        const w2 = words[i + 1] ? words[i + 1].toLowerCase() : "__END__";

        if (i < words.length - 1) {
            const key = `${w1} ${w2}`;
            const w3 = words[i + 2] ? words[i + 2].toLowerCase() : "__END__";
            if (!chain[key]) chain[key] = [];
            chain[key].push(w3);
        }

        if (w1.length > 2) {
            learningData.keywords[w1] = (learningData.keywords[w1] || 0) + 1;
        }
    }

    // 2. Firma de estilo por usuario
    const userId = message.author.id;
    if (!learningData.userStyles[userId]) {
        learningData.userStyles[userId] = {
            name: message.author.username,
            count: 0,
            samples: []
        };
    }
    const userStyle = learningData.userStyles[userId];
    userStyle.name = message.author.username;
    userStyle.count += 1;

    if (words.length >= 3 && words.length <= 20 && !userStyle.samples.includes(cleanContent)) {
        userStyle.samples.push(cleanContent);
        if (userStyle.samples.length > MAX_SAMPLE_PHRASES) userStyle.samples.shift();
    }

    // 3. Contexto reciente
    learningData.recentContext.push({
        author: message.author.username,
        userId: message.author.id,
        content: cleanContent,
        timestamp: Date.now()
    });
    if (learningData.recentContext.length > MAX_RECENT_MESSAGES) learningData.recentContext.shift();

    learningData.totalMessagesIndexed += 1;

    // Guardar los datos actualizados
    const rawData = storage.loadGuildData(guildId);
    rawData.chat_learning = learningData;
    storage.saveGuildData(guildId, rawData);

    return true;
}

/**
 * Modifica configuración del servidor.
 */
function updateConfig(guildId, patch) {
    const rawData = storage.loadGuildData(guildId);
    const learningData = getGuildLearningData(guildId);

    learningData.config = { ...learningData.config, ...patch };
    rawData.chat_learning = learningData;
    storage.saveGuildData(guildId, rawData, true);

    return learningData.config;
}

/**
 * Alterna Opt-Out para un usuario.
 */
function toggleUserOptOut(guildId, userId) {
    const learningData = getGuildLearningData(guildId);
    const list = learningData.config.optedOutUsers;
    const index = list.indexOf(userId);

    let isOptedOut = false;
    if (index > -1) {
        list.splice(index, 1);
    } else {
        list.push(userId);
        isOptedOut = true;
    }

    updateConfig(guildId, { optedOutUsers: list });
    return isOptedOut;
}

/**
 * Alterna la activación de Scrappy en un canal específico.
 * @param {string} guildId 
 * @param {string} channelId 
 * @returns {boolean} true si fue activado, false si fue desactivado
 */
function toggleChannel(guildId, channelId) {
    const learningData = getGuildLearningData(guildId);
    const list = learningData.config.enabledChannels;
    const index = list.indexOf(channelId);

    let isEnabled = false;
    if (index > -1) {
        list.splice(index, 1);
    } else {
        list.push(channelId);
        isEnabled = true;
    }

    updateConfig(guildId, { enabledChannels: list });
    return isEnabled;
}

/**
 * Obtiene estadísticas de aprendizaje.
 */
function getGuildStats(guildId) {
    const data = getGuildLearningData(guildId);
    const markovStatesCount = Object.keys(data.markovChain).length;
    const totalKeywords = Object.keys(data.keywords).length;
    const totalUsersTracked = Object.keys(data.userStyles).length;

    const topKeywords = Object.entries(data.keywords)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([word, freq]) => `${word} (${freq})`);

    return {
        enabled: data.config.enabled,
        mode: data.config.mode,
        autoRespond: data.config.autoRespond,
        totalMessagesIndexed: data.totalMessagesIndexed,
        markovStatesCount,
        totalKeywords,
        totalUsersTracked,
        topKeywords,
        enabledChannelsCount: data.config.enabledChannels.length,
        optedOutCount: data.config.optedOutUsers.length,
        ignoredChannelsCount: data.config.ignoredChannels.length
    };
}

module.exports = {
    getGuildLearningData,
    ingestMessage,
    updateConfig,
    toggleChannel,
    toggleUserOptOut,
    getGuildStats,
    cleanAndTokenizeText
};

