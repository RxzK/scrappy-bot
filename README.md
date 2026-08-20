# 🤖 Scrappy — Bot de Discord con Auto-Aprendizaje e IA Híbrida

**Scrappy** es un bot de Discord de auto-aprendizaje e inteligencia artificial inspirado en GenIA / MasterLuis. Lee los mensajes del chat en tiempo real, memoriza vocabulario, modismos y modas de tu comunidad, y genera respuestas, conversaciones, diálogos y memes dinámicos usando una arquitectura híbrida de **Cadenas de Markov** + **Google Gemini AI**.

---

## 🚀 Requisitos Previos

Para ejecutar **Scrappy** solo necesitas:
1. **Node.js** (v18.0.0 o superior).
2. **Token de Bot de Discord** y **Client ID** ([Discord Developer Portal](https://discord.com/developers/applications)).
3. **Google Gemini API Key** (Gratis en [Google AI Studio](https://aistudio.google.com/)).

---

## 📦 Instalación Rápida

1. Abre una terminal en la carpeta `scrappy/`:
   ```bash
   cd scrappy
   npm install
   ```

2. Crea tu archivo de configuración `.env`:
   Copia el archivo `.env.example` y renómbralo a `.env` (o crea un archivo `.env`):
   ```env
   DISCORD_TOKEN=Tu_Discord_Bot_Token_Aqui
   CLIENT_ID=Tu_Discord_Application_Client_ID_Aqui
   GEMINI_API_KEY=Tu_Gemini_API_Key_Aqui

   # Opcional: ID de servidor de pruebas para registro instantáneo de comandos
   GUILD_ID=
   ```

3. Registra los comandos Slash en Discord API:
   ```bash
   npm run deploy
   ```

4. Inicia el bot:
   ```bash
   npm start
   ```

---

## 🛠️ Comandos Slash Disponibles (`/scrappy`)

- `/scrappy hablar [palabra]`: Genera un mensaje representativo con el lenguaje del servidor.
- `/scrappy dialogo <usuario1> <usuario2> [tema]`: Genera una conversación simulada entre dos usuarios del servidor.
- `/scrappy meme`: Genera una frase o chiste interno meme del servidor.
- `/scrappy stats`: Muestra las estadísticas de aprendizaje (mensajes procesados, estados de Markov, palabras únicas, etc.).
- `/scrappy optout`: Permite a cualquier usuario excluir sus mensajes del aprendizaje por privacidad.
- `/scrappy config [aprendizaje] [modo] [auto_respuesta]`: Panel de configuración para Administradores del servidor.

---

## 🔒 Privacidad y Almacenamiento Local

- **Almacenamiento Local Automático**: Todos los datos aprendidos se guardan localmente en la carpeta `scrappy/data/guilds/` en archivos JSON, sin depender de servidores o bases de datos externas.
- **Opt-Out**: Los usuarios pueden ejecutar `/scrappy optout` para evitar que el bot analice sus mensajes.
- **Filtro de Ruido**: El bot ignora automáticamente comandos (`!`, `/`), URLs, menciones y mensajes de otros bots.
