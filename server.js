import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import axios from "axios";
import FormData from "form-data";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_URL = "https://api.openai.com/v1";

if (!OPENAI_API_KEY) {
  console.warn("⚠️  OPENAI_API_KEY saknas. Sätt den i .env lokalt och som env var på Render.");
}

/** Health */
app.get("/test", (_req, res) => res.send("✅ Whisper proxy online"));

/** Chat pass-through */
app.post("/chat", async (req, res) => {
  try {
    const r = await axios.post(`${OPENAI_URL}/chat/completions`, req.body, {
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
    });
    res.json(r.data);
  } catch (err) {
    console.error("CHAT ERROR:", err?.response?.data || err.message);
    res.status(err?.response?.status || 500).json({ error: err?.response?.data || err.message });
  }
});

/** Translate via GPT */
app.post("/translate", async (req, res) => {
  try {
    const { text, target = "English" } = req.body;
    const payload = {
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: `Translate to ${target}. Preserve meaning, names and tone.` },
        { role: "user", content: text ?? "" },
      ],
    };
    const r = await axios.post(`${OPENAI_URL}/chat/completions`, payload, {
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
    });
    const message = r.data?.choices?.[0]?.message ?? {};
    res.json(message);
  } catch (err) {
    console.error("TRANSLATE ERROR:", err?.response?.data || err.message);
    res.status(err?.response?.status || 500).json({ error: err?.response?.data || err.message });
  }
});

/** Transcribe (Whisper) – skicka base64-ljud från appen */
app.post("/transcribe", async (req, res) => {
  try {
    const { audioBase64, filename = "audio.wav", model = "whisper-1", prompt } = req.body;
    if (!audioBase64) return res.status(400).json({ error: "audioBase64 saknas i body" });

    // ta bort ev. "data:audio/...;base64,"-prefix
    const base64 = audioBase64.includes(",") ? audioBase64.split(",").pop() : audioBase64;
    const buffer = Buffer.from(base64, "base64");

    const form = new FormData();
    form.append("file", buffer, { filename });
    form.append("model", model);
    if (prompt) form.append("prompt", prompt);

    const r = await axios.post(`${OPENAI_URL}/audio/transcriptions`, form, {
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, ...form.getHeaders() },
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    });

    res.json(r.data); // { text: "...", ... }
  } catch (err) {
    console.error("TRANSCRIBE ERROR:", err?.response?.data || err.message);
    res.status(err?.response?.status || 500).json({ error: err?.response?.data || err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Proxy kör på port ${PORT}`));
