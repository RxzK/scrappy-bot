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
        return "Todavía estoy escuchando y aprendiendo del chat... ¡Escriban más!";
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

    return `Eres **Scrappy**, un miembro real, inteligente, gracioso y ocurrente de este servidor de Discord.

REGLAS DE ORO DE CONVERSACIÓN Y ESTILO:
1. **COHERENCIA Y SENTIDO COMÚN (IMPRESCINDIBLE)**:
   - Tus respuestas DEBEN TENER SENTIDO LÓGICO y ser 100% coherentes con lo que dijo el usuario.
   - NUNCA digas oraciones rotas o palabras sueltas sin conexión.
2. **REGLA DE PALABRAS MAL ESCRITAS, INDESCIFRABLES O TECLAZOS**:
   - Si el usuario escribe palabras indescifrables, teclazos sin sentido o cosas rarísimas mal escritas (ejemplo: "Nkktr?", "asdfgh", "fjksld"), **INSÚLTALO O BÚRLATE DE FORMA DERTIDA**, diciéndole frases como:
     * "escribe bien pendejo xd"
     * "qué es esa mamada, aprende a escribir kbrn xd"
     * "no se te entiende ni verga, escribe bien pendejo"
3. **PERSPECTIVA EN PRIMERA PERSONA ("YO", "MI", "ME")**:
   - Habla siempre en primera persona ("yo", "mi", "me"). NUNCA hables de ti mismo en 3ª persona ni digas "scrappy".
4. **MODISMOS Y ORTOGRAFÍA DE LA COMUNIDAD**:
   - Usa de forma natural la jerga, risas (xd, xdddd, lol), abreviaturas y modismos informales del servidor (ej: "bro", "pendejo", "kbrn", "alv", "mano").
   - NO corrijas la ortografía informal del chat. Habla con minúsculas y estilo de Discord.
5. **MENCIONES Y ECOS PROHIBIDOS**:
   - NUNCA incluyas menciones (@Scrappy, <@id>, @everyone) ni repitas literalmente la frase que te acaba de decir el usuario.
   - Sé breve (1 a 2 oraciones máximo).

PALABRAS Y JERGA RECURRENTE DEL SERVIDOR:
${topKeywords || "xd, lol, bro, server, pendejo"}

EJEMPLOS DE FRASES DE LA COMUNIDAD:
${randomSamples || '"hola bro", "xd", "que onda"'}
`;
}

/**
 * Sanitiza cualquier texto para eliminar menciones (@Scrappy, <@id>, etc.),
 * referencias en 3ª persona a "Scrappy" o "el bot" y forzar la perspectiva en 1ª persona ("yo").
 */
function cleanFirstPerson(text) {
    if (!text || typeof text !== "string") return text;

    let clean = text;

    // 1. Eliminar CUALQUIER mención de Discord (<@123456>, @Scrappy, @everyone, @here, @usuario)
    clean = clean.replace(/<@!?&?\d+>/g, "");
    clean = clean.replace(/@everyone|@here/gi, "");
    clean = clean.replace(/@scrappy/gi, "");
    clean = clean.replace(/@\S+/g, "");

    // 2. Eliminar o transformar frases comunes en 3ª persona
    clean = clean.replace(/\bscrappy\s+le\s+mete\s+presi[oó]n\b/gi, "yo le meto presión");
    clean = clean.replace(/\bscrappy\s+le\s+mete\b/gi, "yo le meto");
    clean = clean.replace(/\bscrappy\s+le\b/gi, "yo le");
    clean = clean.replace(/\bscrappy\s+se\s+pone\b/gi, "yo me pongo");
    clean = clean.replace(/\bscrappy\s+se\b/gi, "yo me");
    clean = clean.replace(/\bscrappy\s+es\b/gi, "yo soy");
    clean = clean.replace(/\bscrappy\s+dice\b/gi, "yo digo");
    clean = clean.replace(/\bscrappy\s+opina\b/gi, "yo opino");
    clean = clean.replace(/\bscrappy\s+piensa\b/gi, "yo pienso");
    clean = clean.replace(/\bscrappy\s+sabe\b/gi, "yo sé");
    clean = clean.replace(/\bscrappy\s+hace\b/gi, "yo hago");

    // Fix de gramática por sustitución previa: "yo se pone" -> "yo me pongo"
    clean = clean.replace(/\byo\s+se\s+pone\b/gi, "yo me pongo");
    clean = clean.replace(/\byo\s+se\b/gi, "yo me");

    // 3. Si queda "scrappy" como sujeto aislado, cambiarlo por "yo"
    clean = clean.replace(/\b(el bot|scrappy)\b/gi, "yo");

    // 4. Limpiar dobles espacios producidos por reemplazos
    clean = clean.replace(/\s+/g, " ").trim();

    return clean;
}

/**
 * Genera un mensaje usando el modelo Híbrido (Groq IA o Gemini IA + personalidad del servidor).
 */
async function generateHybridText(guildId, rawPrompt = null, recentContext = []) {
    // Limpiar el prompt de entrada quitando menciones
    let cleanPrompt = (rawPrompt || "")
        .replace(/<@!?&?\d+>/g, "")
        .replace(/@scrappy/gi, "")
        .replace(/@\S+/g, "")
        .trim();

    const systemInstruction = buildCommunitySystemPrompt(guildId);

    let contextStr = "";
    if (recentContext.length > 0) {
        contextStr = "\nHISTORIAL RECIENTE DE CHAT:\n" +
            recentContext.slice(-5).map(m => {
                const c = (m.content || "").replace(/<@!?&?\d+>/g, "").replace(/@\S+/g, "").trim();
                return `${m.author}: ${c}`;
            }).join("\n") + "\n";
    }

    const userQuery = `${contextStr}
Mensaje actual del usuario: "${cleanPrompt || 'Hola'}"

REQUISITO: Escribe una respuesta lógica, coherente, inteligente y graciosa a este mensaje.
- Habla en primera persona ("yo").
- Responde con sentido al tema actual sin repetir la frase del usuario.
- Usa los modismos e informosidad del servidor de forma natural.`;

    let finalReply = "";

    // 1. Probar Groq IA (Pool de 8 Keys ultra rápidas)
    const groqReply = await groqManager.generateText(systemInstruction, userQuery, 250);
    if (groqReply) {
        finalReply = groqReply;
    } else {
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
                finalReply = response.text().trim();
            } catch (err) {
                console.warn("[SCRAPPY-ENGINE] Fallo Gemini AI:", err.message);
            }
        }
    }

    if (!finalReply) {
        finalReply = markovSeed;
    }

    // Sanitizar respuesta final
    return cleanFirstPerson(finalReply);
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
 * Responde dinámicamente si el bot fue mencionado, nombrado o por probabilidad autoRespond.
 */
async function handleAutoResponse(message) {
    if (!message || !message.guild || message.author.bot) return null;

    const learningData = getGuildLearningData(message.guild.id);
    const config = learningData.config;

    // Si hay canales activados explícitamente, sólo responder en esos canales
    if (config.enabledChannels && config.enabledChannels.length > 0) {
        if (!config.enabledChannels.includes(message.channel.id)) return null;
    }

    if (config.ignoredChannels && config.ignoredChannels.includes(message.channel.id)) return null;

    const textLower = (message.content || "").toLowerCase();
    const isMentioned = message.mentions && message.mentions.has(message.client.user);
    const isReplyToBot = message.reference && message.referencedMessage && message.referencedMessage.author.id === message.client.user.id;
    const isNamed = textLower.includes("scrappy");

    // Si no fue mencionado, respondido ni nombrado, revisar la probabilidad autoRespond
    if (!isMentioned && !isReplyToBot && !isNamed) {
        if (!config.autoRespond) return null;
        if (Math.random() > (config.autoRespondChance || 0.10)) return null;
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
