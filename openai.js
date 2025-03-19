const { OpenAI } = require("openai");
const fs = require("fs");
require("dotenv").config();

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

const promptPath = "./prompt.txt";
let systemPrompt = "";

try {
    systemPrompt = fs.readFileSync(promptPath, "utf-8").trim();
} catch (error) {
    console.error("Erro ao carregar o prompt do arquivo de texto:", error);
    systemPrompt = "Você é uma assistente financeira de IA inteligente e gentil.";
}

async function getCompletion(userMessage) {
    try {
        const messages = [
            { role: "system", content: systemPrompt },
            { role: "user", content: userMessage }
        ];

        const response = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: messages,
            max_tokens: 200,
            temperature: 0.7
        });

        return response.choices[0].message.content.trim();
    } catch (error) {
        console.error("Erro ao chamar a API da OpenAI:", error);
        return JSON.stringify({ error: "Erro ao processar a mensagem." });
    }
}

module.exports = { getCompletion };