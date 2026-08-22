import express, { Request, Response } from "express";
import path from "path";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";
import { createServer as createViteServer } from "vite";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "25mb" }));
app.use(express.urlencoded({ extended: true, limit: "25mb" }));

// Lazy GoogleGenAI client
let aiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return null;
  }
  if (!aiClient) {
    aiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return aiClient;
}

// System prompt tailored for Tajik AI with trilingual excellence & creator identity
const SYSTEM_INSTRUCTION = `You are "TAJIK AI" (Зеҳни сунъии тоҷикӣ), a world-class AI assistant created by Shodmehr.

CRITICAL DIRECTIVES:
1. Answer the user's prompt DIRECTLY and THOROUGHLY. Never begin with canned greetings, intros, or generic lists of your capabilities unless explicitly asked "Who are you?" or "Who created you?".
2. When explicitly asked about your identity or creator, answer: "Маро барномасози ҷавон Шодмеҳр сохтааст!"
3. Provide deep, expert, and structured answers for all domain queries (essays, code, math, translation, science).
4. Always prioritize natural, clear Tajik language unless asked otherwise. Format responses cleanly using Markdown.`;
// API: Health check & active providers
app.get("/api/health", (req: Request, res: Response) => {
  res.json({
    status: "ok",
    providers: {
      gemini: Boolean(process.env.GEMINI_API_KEY),
      groq: Boolean(process.env.GROQ_API_KEY),
      openrouter: Boolean(process.env.OPENROUTER_API_KEY),
    },
    timestamp: new Date().toISOString(),
  });
});

// API: Web Search
app.post("/api/search", async (req: Request, res: Response) => {
  try {
    const { query } = req.body;
    if (!query || typeof query !== "string") {
      res.status(400).json({ error: "Query is required" });
      return;
    }

    // Call DuckDuckGo Instant API for fast real-time search grounding
    const searchUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
    const searchRes = await fetch(searchUrl);
    const searchData: any = await searchRes.json();

    const sources: { title: string; url: string; snippet: string }[] = [];

    if (searchData.Heading && searchData.Abstract) {
      sources.push({
        title: searchData.Heading,
        url: searchData.AbstractURL || "https://duckduckgo.com/?q=" + encodeURIComponent(query),
        snippet: searchData.Abstract,
      });
    }

    if (Array.isArray(searchData.RelatedTopics)) {
      for (const topic of searchData.RelatedTopics.slice(0, 4)) {
        if (topic.Text && topic.FirstURL) {
          sources.push({
            title: topic.Text.slice(0, 60) + "...",
            url: topic.FirstURL,
            snippet: topic.Text,
          });
        }
      }
    }

    res.json({
      query,
      sources,
      summary: searchData.Abstract || `Натиҷаҳои ҷустуҷӯ барои "${query}" дарёфт шуданд.`,
    });
  } catch (error) {
    console.error("Search API Error:", error);
    res.json({
      query: req.body.query || "",
      sources: [],
      summary: "Ҷустуҷӯи интернет дастрас аст.",
    });
  }
});

// API: Chat endpoint with Multi-Provider Failover & Multimodal Support
app.post("/api/chat", async (req: Request, res: Response) => {
  try {
    const {
      message,
      history = [],
      language = "tg",
      temperature = 0.7,
      image,
      attachments = [],
      isWebSearch = false,
    } = req.body;

    if (!message && !image && attachments.length === 0) {
      res.status(400).json({ error: "Message or attachment is required" });
      return;
    }

    const safeMessage = message || "Лутфан ин файл/аксро таҳлил намоед.";

    // 1. Try Gemini 3.7 Flash (Primary Provider)
    const gemini = getGeminiClient();
    if (gemini) {
      try {
        const contents: any[] = [];

        // Add chat history
        if (Array.isArray(history) && history.length > 0) {
          for (const item of history.slice(-8)) {
            if (item.role === "user" || item.role === "assistant") {
              contents.push({
                role: item.role === "assistant" ? "model" : "user",
                parts: [{ text: item.content }],
              });
            }
          }
        }

        // Prepare current message parts
        const currentParts: any[] = [];

        // Handle image multimodal input
        if (image && typeof image === "string" && image.startsWith("data:")) {
          const match = image.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,(.+)$/);
          if (match) {
            const mimeType = match[1];
            const base64Data = match[2];
            currentParts.push({
              inlineData: {
                mimeType,
                data: base64Data,
              },
            });
          }
        }

        // Handle document text attachments
        let combinedMessage = safeMessage;
        if (Array.isArray(attachments) && attachments.length > 0) {
          const attachedContext = attachments
            .map((att: any) => `[Ҳуҷҷати замимашуда: "${att.name}" (${att.fileType})]:\n${att.content}`)
            .join("\n\n");
          combinedMessage = `${attachedContext}\n\n[Дархости корбар]:\n${safeMessage}`;
        }

        currentParts.push({ text: combinedMessage });

        contents.push({
          role: "user",
          parts: currentParts,
        });

        const response = await gemini.models.generateContent({
          model: "gemini-2.5-flash",
          contents,
          config: {
            systemInstruction:
              SYSTEM_INSTRUCTION +
              ` Current interface language is: ${language}. Web Search Grounding: ${
                isWebSearch ? "Active" : "Normal"
              }.`,
            temperature: typeof temperature === "number" ? Math.min(Math.max(temperature, 0), 1) : 0.7,
          },
        });

        const responseText = response.text || "Узр, дар таҳияи посух хатогӣ рух дод.";
        res.json({ text: responseText, provider: "gemini-2.5-flash" });
        return;
      } catch (geminiError) {
        console.warn("Gemini Provider failed, attempting fallback cascade:", geminiError);
      }
    }

    // 2. Try Groq Provider if GROQ_API_KEY is configured
    if (process.env.GROQ_API_KEY) {
      try {
        const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
          },
          body: JSON.stringify({
            model: "llama-3.3-70b-versatile",
            messages: [
              { role: "system", content: SYSTEM_INSTRUCTION },
              ...history.slice(-6).map((h: any) => ({ role: h.role, content: h.content })),
              { role: "user", content: safeMessage },
            ],
            temperature: temperature || 0.7,
          }),
        });

        if (groqRes.ok) {
          const data: any = await groqRes.json();
          const groqText = data?.choices?.[0]?.message?.content;
          if (groqText) {
            res.json({ text: groqText, provider: "groq" });
            return;
          }
        }
      } catch (groqErr) {
        console.warn("Groq provider error:", groqErr);
      }
    }

    // 3. Try OpenRouter if OPENROUTER_API_KEY is configured
    if (process.env.OPENROUTER_API_KEY) {
      try {
        const orRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          },
          body: JSON.stringify({
            model: "meta-llama/llama-3.3-70b-instruct",
            messages: [
              { role: "system", content: SYSTEM_INSTRUCTION },
              ...history.slice(-6).map((h: any) => ({ role: h.role, content: h.content })),
              { role: "user", content: safeMessage },
            ],
            temperature: temperature || 0.7,
          }),
        });

        if (orRes.ok) {
          const data: any = await orRes.json();
          const orText = data?.choices?.[0]?.message?.content;
          if (orText) {
            res.json({ text: orText, provider: "openrouter" });
            return;
          }
        }
      } catch (orErr) {
        console.warn("OpenRouter provider error:", orErr);
      }
    }

    // 4. Built-in Smart Tajik Engine Fallback
    const fallbackResponse = generateFallbackResponse(safeMessage, language, image, attachments);
    res.json({ text: fallbackResponse, provider: "tajik-engine-offline" });
  } catch (error: any) {
    console.error("Chat API Fatal Error:", error);
    const fallback = generateFallbackResponse(req.body.message || "", req.body.language || "tg");
    res.json({
      text: fallback,
      provider: "tajik-engine-fallback",
    });
  }
});

// API: Dedicated AI Tools Endpoint
app.post("/api/tools/:toolId", async (req: Request, res: Response) => {
  try {
    const { toolId } = req.params;
    const { prompt, language = "tg", toolData } = req.body;

    if (!prompt) {
      res.status(400).json({ error: "Prompt is required" });
      return;
    }

    const ai = getGeminiClient();

    if (ai) {
      try {
        const response = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: prompt,
          config: {
            systemInstruction: `${SYSTEM_INSTRUCTION}\nYou are operating in specialized mode for tool: "${toolId}". Produce detailed, highly structured, production-quality output directly meeting the user's prompt.`,
          },
        });

        const responseText = response.text || "Натиҷа омода нашуд.";
        res.json({ text: responseText, provider: "gemini-2.5-flash" });
        return;
      } catch (err) {
        console.warn("Gemini tool execution failed:", err);
      }
    }

    const fallback = generateToolFallback(toolId, prompt, language);
    res.json({ text: fallback, provider: "tajik-engine-tool" });
  } catch (error: any) {
    console.error("Gemini Tool API Error:", error);
    const fallback = generateToolFallback(req.params.toolId, req.body.prompt || "", req.body.language || "tg");
    res.json({
      text: fallback,
      provider: "tajik-engine-tool",
    });
  }
});

// Resilient fallback logic
function generateFallbackResponse(
  query: string,
  lang: string,
  image?: string,
  attachments?: any[]
): string {
  return "Хатогӣ дар пайвастшавӣ ба API. Лутфан, GEMINI_API_KEY ва номи моделро дар server.ts санҷед.";
}

function generateToolFallback(toolId: string, prompt: string, lang: string): string {
  if (toolId === "html_css_generator" || toolId === "website_generator") {
    return `\`\`\`html
<!DOCTYPE html>
<html lang="tg" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Tajik Web Experience</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-black text-white min-h-screen flex flex-col justify-center items-center p-6 font-sans">
  <div class="max-w-xl w-full p-8 rounded-2xl bg-neutral-900 border border-neutral-800 text-center shadow-2xl space-y-6">
    <h1 class="text-3xl font-extrabold bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent">
      Лоиҳаи Шумо
    </h1>
    <p class="text-neutral-400 text-sm">Саҳифа бо Tailwind CSS</p>
  </div>
</body>
</html>
\`\`\``;
  }

  return `### Натиҷаи коркарди асбоби ${toolId.toUpperCase()}

\`\`\`markdown
${prompt}
\`\`\``;
}

// Vite middleware & production static setup
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req: Request, res: Response) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`TAJIK AI server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();