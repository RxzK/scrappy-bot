/**
 * Scrappy Bot - GenAI Engine
 * Motor Híbrido: Cadenas de Markov (lenguaje crudo) + Gemini AI (síntesis inteligente).
 */

const groqManager = require('./groqManager');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { getGuildLearningData } = require('./chatLearnerStore');

function getGenAIInstance() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey.includes("Tu_Gemini_API_Key")) {
        return null;
    }
    return new GoogleGenerativeAI(apiKey);
}

function getRandomElement(arr) {
    if (!Array.isArray(arr) || arr.length === 0) return null;
    return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Genera una oración usando la matriz de cadenas de Markov aprendidas del servidor.
 * @param {string} guildId 
 * @param {string} [promptWord] 
 * @param {number} [maxWords=25] 
 * @returns {string}
 */
function generateMarkovText(guildId, promptWord = null, maxWords = 25) {
    const learningData = getGuildLearningData(guildId);
    const chain = learningData.markovChain || {};
    const stateKeys = Object.keys(chain);

    if (stateKeys.length === 0) {
        return "Scrappy todavía está escuchando y aprendiendo del chat... ¡Escriban más!";
    }

    let currentKey = null;

    if (promptWord) {
        const cleanPrompt = promptWord.trim().toLowerCase();
        const startCandidates = stateKeys.filter(k => k.toLowerCase().includes(cleanPrompt));
        if (startCandidates.length > 0) currentKey = getRandomElement(startCandidates);
    }

    if (!currentKey) {
        const startStates = stateKeys.filter(k => k.startsWith("__START__"));
        if (startStates.length > 0) {
            currentKey = getRandomElement(startStates);
        } else {
            currentKey = getRandomElement(stateKeys);
        }
    }

    const words = [];
    const keyParts = currentKey.replace("__START__ ", "").split(" ");
    words.push(...keyParts.filter(w => w !== "__END__"));

    for (let i = 0; i < maxWords; i++) {
        const lastTwo = words.slice(-2).join(" ").toLowerCase();
        let nextWords = chain[lastTwo];

        if (!nextWords || nextWords.length === 0) {
            const lastOne = words[words.length - 1]?.toLowerCase();
            const fallbackKeys = stateKeys.filter(k => k.split(" ")[0].toLowerCase() === lastOne);
            if (fallbackKeys.length > 0) {
                const randomKey = getRandomElement(fallbackKeys);
                nextWords = chain[randomKey];
            }
        }

        if (!nextWords || nextWords.length === 0) break;
        const nextWord = getRandomElement(nextWords);
        if (!nextWord || nextWord === "__END__") break;

        words.push(nextWord);
    }

    if (words.length === 0) return "xd no me salió nada inteligente, hablen más";

    let result = words.join(" ");
    return result.charAt(0).toUpperCase() + result.slice(1);
}

/**
 * Prepara el prompt de sistema para la IA con la personalidad del servidor.
 */
function buildCommunitySystemPrompt(guildId) {
    const learningData = getGuildLearningData(guildId);

    const topKeywords = Object.entries(learningData.keywords || {})
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20)
        .map(([w]) => w)
        .join(", ");

    const samplePhrases = [];
    Object.values(learningData.userStyles || {}).forEach(user => {
        if (user.samples && user.samples.length > 0) {
            samplePhrases.push(...user.samples.slice(-3));
        }
    });

    const randomSamples = samplePhrases
        .sort(() => 0.5 - Math.random())
        .slice(0, 15)
        .map(s => `"${s}"`)
        .join("\n");

    return `Eres **Scrappy**, un bot de Discord de auto-aprendizaje e IA que habla como los miembros del servidor.
TU OBJETIVO: Responder y generar mensajes que suenen 100% como si los hubiera escrito un miembro activo de esta comunidad de Discord.

NORMAS DE ESTILO Y PERSONALIDAD:
- Usa el vocabulario, la jerga, abreviaciones y tono informal exacto de este servidor.
- Mantén un tono natural, a veces gracioso, sarcástico o meme (según el contexto).
- Puedes usar minúsculas, emojis frecuentes, expresiones como "xd", "lol", "bro", "mano", "güey", "que", "basado", etc.
- NUNCA respondas como una IA formal, asistente virtual o robot corporativo. Sé un miembro más del chat.
- Mantén respuestas breves y directas (1 a 3 oraciones máximo, como en un chat de Discord).

PALABRAS CLAVE Y JERGA RECURRENTE EN ESTE SERVIDOR:
${topKeywords || "xd, lol, bro, server"}

EJEMPLOS DE FRASES REALES DEL SERVIDOR QUE DEBES EMULAR:
${randomSamples || '"hola bro", "xd", "que onda"'}
`;
}

/**
 * Genera un mensaje usando el modelo Híbrido (Groq IA o Gemini IA + personalidad del servidor).
 */
async function generateHybridText(guildId, prompt = null, recentContext = []) {
    const markovSeed = generateMarkovText(guildId, prompt, 15);
    const systemInstruction = buildCommunitySystemPrompt(guildId);

    let contextStr = "";
    if (recentContext.length > 0) {
        contextStr = "\nCONTEXTO RECIENTE DEL CHAT:\n" +
            recentContext.map(m => `${m.author}: ${m.content}`).join("\n") + "\n";
    }

    const userQuery = `${contextStr}
Sugerencia de patrón aprendido: "${markovSeed}"
${prompt ? `Tema o mención a responder: "${prompt}"` : 'Genera una frase o comentario representativo del chat ahora mismo.'}`;

    // 1. Probar Groq IA (Pool de 8 Keys ultra rápidas)
    const groqReply = await groqManager.generateText(systemInstruction, userQuery, 250);
    if (groqReply) return groqReply;

    // 2. Fallback a Gemini AI
    const genAI = getGenAIInstance();
    if (genAI) {
        try {
            const model = genAI.getGenerativeModel({
                model: "gemini-1.5-flash",
                systemInstruction
            });
            const result = await model.generateContent(userQuery);
            const response = await result.response;
            return response.text().trim();
        } catch (err) {
            console.warn("[SCRAPPY-ENGINE] Fallo Gemini AI:", err.message);
        }
    }

    // 3. Fallback final a Cadenas de Markov
    return markovSeed;
}

/**
 * Genera un diálogo simulado entre dos personas del servidor.
 */
async function generateDialogue(guildId, user1Name = "Usuario1", user2Name = "Usuario2", topic = null) {
    const systemInstruction = buildCommunitySystemPrompt(guildId);
    const userQuery = `Genera un diálogo corto y divertido en formato de chat de Discord entre dos miembros del servidor: **${user1Name}** y **${user2Name}**.
${topic ? `Tema de discusión: "${topic}"` : 'Tema: una conversación cotidiana, broma o debate sobre el servidor.'}
Requisitos:
- Exactamente 4 a 6 mensajes intercalados entre ${user1Name} y ${user2Name}.
- Formato por línea: "**Nombre**: mensaje"
- Usa la jerga, risas (xd) y modismos del servidor.`;

    // 1. Probar Groq IA
    const groqDialogue = await groqManager.generateText(systemInstruction, userQuery, 400);
    if (groqDialogue) return groqDialogue;

    // 2. Fallback a Gemini AI
    const genAI = getGenAIInstance();
    if (genAI) {
        try {
            const model = genAI.getGenerativeModel({
                model: "gemini-1.5-flash",
                systemInstruction
            });
            const result = await model.generateContent(userQuery);
            const response = await result.response;
            return response.text().trim();
        } catch (err) {
            console.error("[SCRAPPY-ENGINE] Error Gemini en diálogo:", err.message);
        }
    }

    // 3. Fallback Markov
    const m1 = generateMarkovText(guildId, null, 10);
    const m2 = generateMarkovText(guildId, null, 10);
    return `**${user1Name}**: ${m1}\n**${user2Name}**: ${m2}`;
}

/**
 * Genera una frase o quote tipo meme.
 */
async function generateMemeQuote(guildId) {
    const systemInstruction = buildCommunitySystemPrompt(guildId);
    const userQuery = `Genera una frase épica o meme interno representativo de esta comunidad. Formato corto (máximo 2 líneas). Debe ser gracioso o "basado".`;

    // 1. Probar Groq IA
    const groqMeme = await groqManager.generateText(systemInstruction, userQuery, 150);
    if (groqMeme) return groqMeme;

    // 2. Fallback Gemini AI
    const genAI = getGenAIInstance();
    if (genAI) {
        try {
            const model = genAI.getGenerativeModel({
                model: "gemini-1.5-flash",
                systemInstruction
            });
            const result = await model.generateContent(userQuery);
            const response = await result.response;
            return response.text().trim();
        } catch (err) { }
    }

    // 3. Fallback Markov
    return generateMarkovText(guildId, null, 12);
}

/**
 * Responde dinámicamente si el bot fue mencionado o por probabilidad autoRespond.
 */
async function handleAutoResponse(message) {
    if (!message || !message.guild || message.author.bot) return null;

    const learningData = getGuildLearningData(message.guild.id);
    const config = learningData.config;

    const isMentioned = message.mentions && message.mentions.has(message.client.user);
    const isReplyToBot = message.reference && message.referencedMessage && message.referencedMessage.author.id === message.client.user.id;

    if (!isMentioned && !isReplyToBot) {
        if (!config.autoRespond) return null;
        if (Math.random() > (config.autoRespondChance || 0.05)) return null;
    }

    const mode = config.mode || "hybrid";
    const recent = learningData.recentContext || [];

    if (mode === "markov") {
        const word = message.content.split(/\s+/)[0];
        return generateMarkovText(message.guild.id, word, 20);
    } else {
        return await generateHybridText(message.guild.id, message.content, recent);
    }
}

module.exports = {
    generateMarkovText,
    generateHybridText,
    generateDialogue,
    generateMemeQuote,
    handleAutoResponse
};
