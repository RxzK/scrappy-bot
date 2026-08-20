/**
 * Scrappy Bot - Groq Manager
 * Gestor de rotación de API Keys de Groq IA para inferencia ultra-rápida (Llama 3.3 70B / Llama 3 8B).
 */

class GroqManager {
    constructor() {
        this.keys = [];
        this.currentIndex = 0;
        this.cooldowns = new Map();
        this.loadKeys();
    }

    loadKeys() {
        const rawKeys = process.env.GROQ_API_KEYS || process.env.GROQ_API_KEY || "";
        this.keys = rawKeys.split(/[,;\s]+/).map(k => k.trim()).filter(k => k.startsWith('gsk_'));

        if (this.keys.length > 0) {
            console.log(`[GROQ-POOL] 🚀 Cargadas ${this.keys.length} API Keys de Groq IA para rotación.`);
        } else {
            console.warn("[GROQ-POOL] ⚠️ No se encontraron API Keys válidas de Groq IA.");
        }
    }

    getNextKey() {
        if (this.keys.length === 0) this.loadKeys();
        if (this.keys.length === 0) return null;

        const now = Date.now();
        for (let i = 0; i < this.keys.length; i++) {
            const index = (this.currentIndex + i) % this.keys.length;
            const key = this.keys[index];
            const cooldownUntil = this.cooldowns.get(key) || 0;

            if (now >= cooldownUntil) {
                this.currentIndex = (index + 1) % this.keys.length;
                return key;
            }
        }

        // Si todas están en cooldown, retornar la actual
        const key = this.keys[this.currentIndex];
        this.currentIndex = (this.currentIndex + 1) % this.keys.length;
        return key;
    }

    markKeyCooldown(key, seconds = 60) {
        if (!key) return;
        this.cooldowns.set(key, Date.now() + (seconds * 1000));
        console.warn(`[GROQ-POOL] ⏳ Key ...${key.slice(-6)} en cooldown por ${seconds}s.`);
    }

    /**
     * Genera una respuesta usando el modelo Llama 3.3 / Llama 3 en Groq.
     * @param {string} systemPrompt 
     * @param {string} userPrompt 
     * @param {number} [maxTokens=300] 
     * @returns {Promise<string|null>}
     */
    async generateText(systemPrompt, userPrompt, maxTokens = 300) {
        if (this.keys.length === 0) return null;

        const models = ["groq/compound", "groq/compound-mini", "openai/gpt-oss-120b", "openai/gpt-oss-20b", "qwen/qwen3.6-27b"];

        for (let attempt = 0; attempt < Math.min(this.keys.length * 2, 6); attempt++) {
            const apiKey = this.getNextKey();
            if (!apiKey) break;

            const model = models[attempt % models.length];

            try {
                const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                    method: "POST",
                    headers: {
                        "Authorization": `Bearer ${apiKey}`,
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        model,
                        messages: [
                            { role: "system", content: systemPrompt },
                            { role: "user", content: userPrompt }
                        ],
                        max_tokens: maxTokens,
                        temperature: 0.8
                    })
                });

                if (response.status === 429) {
                    this.markKeyCooldown(apiKey, 60);
                    continue;
                }

                if (!response.ok) {
                    const errText = await response.text();
                    console.error(`[GROQ-ERR] HTTP ${response.status} en modelo ${model}:`, errText.slice(0, 150));
                    this.markKeyCooldown(apiKey, 15);
                    continue;
                }

                const data = await response.json();
                const textPayload = data?.choices?.[0]?.message?.content;
                if (textPayload && textPayload.trim()) {
                    return textPayload.trim();
                }
            } catch (err) {
                console.error(`[GROQ-FETCH-ERR] Intent ${attempt + 1}:`, err.message);
                this.markKeyCooldown(apiKey, 15);
            }
        }

        return null;
    }
}

module.exports = new GroqManager();
