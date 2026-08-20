require('dotenv').config();
const { Client, GatewayIntentBits, Collection } = require('discord.js');
const chatLearnerStore = require('./utils/chatLearnerStore');
const genAiEngine = require('./utils/genAiEngine');
const scrappyCommand = require('./commands/scrappy');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

client.commands = new Collection();
client.commands.set(scrappyCommand.data.name, scrappyCommand);

client.once('ready', () => {
    console.log("==========================================");
    console.log(`🤖 Scrappy Bot online como: ${client.user.tag}`);
    console.log("🧠 Motor de auto-aprendizaje de chat activo");
    console.log("==========================================");
});

// Manejo de Comandos Slash
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);
    if (!command) return;

    try {
        await command.execute(interaction);
    } catch (error) {
        console.error(`[SCRAPPY-CMD-ERR] Error en /${interaction.commandName}:`, error);
        const errPayload = { content: "❌ Ocurrió un error al ejecutar el comando.", ephemeral: true };
        if (interaction.deferred || interaction.replied) {
            await interaction.editReply(errPayload).catch(() => null);
        } else {
            await interaction.reply(errPayload).catch(() => null);
        }
    }
});

// Escucha de Mensajes para Auto-Aprendizaje y Auto-Respuesta
client.on('messageCreate', async (message) => {
    if (!message.guild || message.author.bot) return;

    // 1. Ingestar mensaje para aprendizaje continuo
    chatLearnerStore.ingestMessage(message);

    // 2. Evaluar si debe responder al mensaje (por mención o probabilidad)
    try {
        const autoReply = await genAiEngine.handleAutoResponse(message);
        if (autoReply && typeof autoReply === 'string' && autoReply.trim()) {
            await message.reply(autoReply);
        }
    } catch (err) {
        console.error("[SCRAPPY-AUTORESPOND-ERR]", err.message);
    }
});

const token = process.env.DISCORD_TOKEN;
if (!token || token.includes("Tu_Discord_Bot_Token")) {
    console.error("❌ ERROR CRÍTICO: No se encontró el DISCORD_TOKEN en el archivo .env.");
    console.error("👉 Edita el archivo 'scrappy/.env' y añade tu token de bot.");
    process.exit(1);
}

client.login(token).catch(err => {
    console.error("❌ Error al conectar con Discord:", err.message);
});
