const { EmbedBuilder, SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const chatLearnerStore = require('../utils/chatLearnerStore');
const genAiEngine = require('../utils/genAiEngine');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('scrappy')
        .setDescription('Scrappy Bot: Auto-aprendizaje de chat, frases de la comunidad y diálogos.')
        .addSubcommand(sub =>
            sub.setName('activar')
                .setDescription('Activa o desactiva a Scrappy en el canal actual para aprender y responder.')
        )
        .addSubcommand(sub =>
            sub.setName('hablar')
                .setDescription('Genera un mensaje al estilo de la comunidad.')
                .addStringOption(opt => opt.setName('palabra').setDescription('Palabra o tema inicial'))
        )
        .addSubcommand(sub =>
            sub.setName('dialogo')
                .setDescription('Genera una conversación simulada entre dos miembros.')
                .addStringOption(opt => opt.setName('usuario1').setDescription('Nombre del primer usuario').setRequired(true))
                .addStringOption(opt => opt.setName('usuario2').setDescription('Nombre del segundo usuario').setRequired(true))
                .addStringOption(opt => opt.setName('tema').setDescription('Tema de conversación'))
        )
        .addSubcommand(sub =>
            sub.setName('meme')
                .setDescription('Genera una frase o meme basada en los chistes del servidor.')
        )
        .addSubcommand(sub =>
            sub.setName('stats')
                .setDescription('Muestra las estadísticas de auto-aprendizaje del servidor.')
        )
        .addSubcommand(sub =>
            sub.setName('optout')
                .setDescription('Activa o desactiva la recolección de tus mensajes para aprendizaje.')
        )
        .addSubcommand(sub =>
            sub.setName('config')
                .setDescription('Configuración de Scrappy en el servidor (Solo Admins).')
                .addBooleanOption(opt => opt.setName('aprendizaje').setDescription('Habilitar/deshabilitar auto-aprendizaje'))
                .addStringOption(opt => opt.setName('modo').setDescription('Modo de generación')
                    .addChoices(
                        { name: 'Híbrido (Markov + Gemini AI)', value: 'hybrid' },
                        { name: 'Cadenas de Markov (Lenguaje Crudo)', value: 'markov' },
                        { name: 'Gemini AI Puro', value: 'gemini' }
                    ))
                .addBooleanOption(opt => opt.setName('auto_respuesta').setDescription('Responder automáticamente en el chat'))
        ),

    async execute(interaction) {
        if (!interaction.guild) {
            return interaction.reply({ content: "❌ Este comando sólo se puede usar dentro de un servidor.", ephemeral: true });
        }

        const guildId = interaction.guild.id;
        const subcommand = interaction.options.getSubcommand();

        await interaction.deferReply({ ephemeral: subcommand === 'optout' });

        // 0. ACTIVAR EN CANAL
        if (subcommand === 'activar') {
            if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels) && !interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
                return interaction.editReply({ content: "❌ Necesitas el permiso de **Gestionar Canales** o **Administrador** para activar/desactivar Scrappy en este canal." });
            }

            const channelId = interaction.channel.id;
            const isEnabled = chatLearnerStore.toggleChannel(guildId, channelId);

            const embed = new EmbedBuilder()
                .setColor(isEnabled ? '#2ECC71' : '#E74C3C')
                .setTitle(isEnabled ? '🟢 Scrappy Activado en este Canal' : '🔴 Scrappy Desactivado en este Canal')
                .setDescription(
                    isEnabled
                        ? `🧠 **Scrappy ahora leerá, aprenderá y responderá automáticamente en <#${channelId}>.**\n\n- Responderá cuando lo mencionen (<@${interaction.client.user.id}>), nombren *"scrappy"*, le respondan o por azar (10% de probabilidad en el chat).`
                        : `🛑 **Scrappy ya no leerá ni responderá mensajes en <#${channelId}>.**`
                )
                .setFooter({ text: 'Scrappy Bot · Control por Canal' });

            return interaction.editReply({ embeds: [embed] });
        }
        if (subcommand === 'hablar') {
            const promptWord = interaction.options.getString('palabra');
            const learningData = chatLearnerStore.getGuildLearningData(guildId);
            const mode = learningData.config.mode || 'hybrid';

            let text = "";
            if (mode === 'markov') {
                text = genAiEngine.generateMarkovText(guildId, promptWord);
            } else {
                text = await genAiEngine.generateHybridText(guildId, promptWord, learningData.recentContext || []);
            }

            const embed = new EmbedBuilder()
                .setColor('#9B59B6')
                .setAuthor({ name: `${interaction.guild.name} · Scrappy Bot`, iconURL: interaction.guild.iconURL() })
                .setDescription(`💬 **${text}**`)
                .setFooter({ text: `Modo: ${mode.toUpperCase()} · Frase generada con lenguaje del servidor` });

            return interaction.editReply({ embeds: [embed] });
        }

        // 2. DIALOGO
        if (subcommand === 'dialogo') {
            const user1 = interaction.options.getString('usuario1');
            const user2 = interaction.options.getString('usuario2');
            const topic = interaction.options.getString('tema');

            const dialogueText = await genAiEngine.generateDialogue(guildId, user1, user2, topic);

            const embed = new EmbedBuilder()
                .setColor('#3498DB')
                .setTitle(`🗣️ Diálogo Simulado: ${user1} & ${user2}`)
                .setDescription(dialogueText)
                .setFooter({ text: 'Scrappy Bot · Basado en modismos de la comunidad' });

            return interaction.editReply({ embeds: [embed] });
        }

        // 3. MEME
        if (subcommand === 'meme') {
            const memeText = await genAiEngine.generateMemeQuote(guildId);

            const embed = new EmbedBuilder()
                .setColor('#F1C40F')
                .setTitle('🎭 Meme Quote del Servidor')
                .setDescription(`*"${memeText}"*`)
                .setFooter({ text: `Scrappy Bot · ${interaction.guild.name}` });

            return interaction.editReply({ embeds: [embed] });
        }

        // 4. STATS
        if (subcommand === 'stats') {
            const stats = chatLearnerStore.getGuildStats(guildId);

            const embed = new EmbedBuilder()
                .setColor('#2ECC71')
                .setTitle(`📊 Estadísticas de Auto-Aprendizaje — Scrappy`)
                .setThumbnail(interaction.client.user.displayAvatarURL())
                .addFields(
                    { name: '⚡ Estado', value: stats.enabled ? '🟢 **Activo**' : '🔴 **Desactivado**', inline: true },
                    { name: '⚙️ Modo', value: `\`${stats.mode.toUpperCase()}\``, inline: true },
                    { name: '🤖 Auto-Respuesta', value: stats.autoRespond ? '🟢 Activada' : '🔴 Desactivada', inline: true },
                    { name: '📩 Mensajes Procesados', value: `**${stats.totalMessagesIndexed.toLocaleString()}**`, inline: true },
                    { name: '🧠 Estados de Markov', value: `**${stats.markovStatesCount.toLocaleString()}**`, inline: true },
                    { name: '🔤 Palabras Únicas', value: `**${stats.totalKeywords.toLocaleString()}**`, inline: true },
                    { name: '👥 Miembros Registrados', value: `**${stats.totalUsersTracked.toLocaleString()}**`, inline: true },
                    { name: '🚫 Usuarios Opt-Out', value: `**${stats.optedOutCount}**`, inline: true },
                    { name: '🔒 Canales Ignorados', value: `**${stats.ignoredChannelsCount}**`, inline: true },
                    { name: '🔥 Top Palabras', value: stats.topKeywords.length > 0 ? stats.topKeywords.join(', ') : 'Ninguna aun', inline: false }
                )
                .setFooter({ text: 'Scrappy Bot · Aprendizaje Continuo' })
                .setTimestamp();

            return interaction.editReply({ embeds: [embed] });
        }

        // 5. OPTOUT
        if (subcommand === 'optout') {
            const userId = interaction.user.id;
            const isOptedOut = chatLearnerStore.toggleUserOptOut(guildId, userId);

            const statusMsg = isOptedOut
                ? "🔒 **Has quedado excluido (Opt-Out).** Scrappy no volverá a leer ni aprender de tus mensajes."
                : "🔓 **Has vuelto a activar la recolección.** Tus mensajes ayudarán a alimentar el vocabulario de Scrappy.";

            return interaction.editReply({ content: statusMsg });
        }

        // 6. CONFIG
        if (subcommand === 'config') {
            if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
                return interaction.editReply({ content: "❌ Solo los administradores pueden cambiar la configuración de Scrappy." });
            }

            const patch = {};
            const aprendizaje = interaction.options.getBoolean('aprendizaje');
            const modo = interaction.options.getString('modo');
            const autoRespuesta = interaction.options.getBoolean('auto_respuesta');

            if (aprendizaje !== null) patch.enabled = aprendizaje;
            if (modo !== null) patch.mode = modo;
            if (autoRespuesta !== null) patch.autoRespond = autoRespuesta;

            if (Object.keys(patch).length === 0) {
                return interaction.editReply({ content: "⚠️ Debes especificar al menos un parámetro a modificar (`aprendizaje`, `modo` o `auto_respuesta`)." });
            }

            const updatedConfig = chatLearnerStore.updateConfig(guildId, patch);

            const embed = new EmbedBuilder()
                .setColor('#E67E22')
                .setTitle('⚙️ Configuración de Scrappy Actualizada')
                .addFields(
                    { name: 'Aprendizaje', value: updatedConfig.enabled ? '🟢 Habilitado' : '🔴 Deshabilitado', inline: true },
                    { name: 'Modo', value: `\`${updatedConfig.mode.toUpperCase()}\``, inline: true },
                    { name: 'Auto-Respuesta', value: updatedConfig.autoRespond ? '🟢 Activada' : '🔴 Desactivada', inline: true }
                );

            return interaction.editReply({ embeds: [embed] });
        }
    }
};
