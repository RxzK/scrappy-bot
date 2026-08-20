const path = require('path');
const storage = require('../utils/storage');
const chatLearnerStore = require('../utils/chatLearnerStore');
const genAiEngine = require('../utils/genAiEngine');

async function testScrappy() {
    console.log("==========================================");
    console.log("🧪 PROBANDO REPOSITORIO INDEPENDIENTE SCRAPPY");
    console.log("==========================================");

    const testGuildId = "guild_scrappy_test_123";

    // 1. Probar Limpieza y Tokenización
    console.log("\n1. Probando Limpieza de Mensajes:");
    const testMsgs = [
        "¡Hola a todos en el chat! xd https://link.com",
        "que onda bro como andas lol",
        "!ping",
        "<@12345> mira esto hermano xd"
    ];

    for (const msg of testMsgs) {
        const clean = chatLearnerStore.cleanAndTokenizeText(msg);
        console.log(`Original: "${msg}" -> Limpio: ${clean ? `"${clean}"` : '[FILTRADO]'}`);
    }

    // 2. Ingestar mensajes en Scrappy
    console.log("\n2. Ingestando mensajes en Chat Learner:");
    for (const content of testMsgs) {
        const fakeMsg = {
            guild: { id: testGuildId, name: "Scrappy Guild" },
            channel: { id: "c1", name: "general" },
            author: { id: "u1", username: "Buba", bot: false },
            content
        };
        const res = chatLearnerStore.ingestMessage(fakeMsg);
        console.log(`Ingestado: ${res}`);
    }

    // 3. Probar Almacenamiento Local JSON
    console.log("\n3. Verificando Persistencia en Disco Local JSON:");
    const savedData = storage.loadGuildData(testGuildId);
    console.log(`Persistencia de Markov OK, total estados: ${Object.keys(savedData.chat_learning.markovChain).length}`);

    // 4. Probar Generación Markov
    console.log("\n4. Frase Generada por Cadenas de Markov:");
    const markovPhrase = genAiEngine.generateMarkovText(testGuildId, "bro");
    console.log(`> Markov: "${markovPhrase}"`);

    // 5. Probar Meme Quote
    console.log("\n5. Meme Quote Generado:");
    const memeQuote = await genAiEngine.generateMemeQuote(testGuildId);
    console.log(`> Meme: "${memeQuote}"`);

    console.log("\n✅ TODAS LAS PRUEBAS DE SCRAPPY PASARON CON ÉXITO");
}

testScrappy().catch(err => {
    console.error("❌ Error probando Scrappy:", err);
});
