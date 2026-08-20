require('dotenv').config();
const { REST, Routes } = require('discord.js');
const scrappyCommand = require('./commands/scrappy');

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID;

if (!token || !clientId || token.includes("Tu_Discord_Bot_Token")) {
    console.error("❌ Error: Debes configurar DISCORD_TOKEN y CLIENT_ID en el archivo .env antes de registrar los comandos.");
    process.exit(1);
}

const commands = [scrappyCommand.data.toJSON()];
const rest = new REST().setToken(token);

(async () => {
    try {
        console.log(`🚀 Registrando ${commands.length} comando(s) slash (/scrappy) en Discord API...`);

        if (guildId) {
            // Despliegue en servidor de pruebas especifico (Instantaneo)
            await rest.put(
                Routes.applicationGuildCommands(clientId, guildId),
                { body: commands }
            );
            console.log(`✅ Comandos slash registrados exitosamente en el servidor ${guildId}.`);
        } else {
            // Despliegue Global
            await rest.put(
                Routes.applicationCommands(clientId),
                { body: commands }
            );
            console.log("✅ Comandos slash registrados exitosamente a nivel GLOBAL.");
        }
    } catch (error) {
        console.error("❌ Error al desplegar comandos:", error);
    }
})();
