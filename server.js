import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import axios from "axios";
import FormData from "form-data";

dotenv.config();

const app = express();
app.get("/test", (req, res) => {
  res.send("✅ Whisper proxy online");
});


// Tillåt stora payloads från mobilen
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Öppna CORS (kan låsas ner senare till din app/domän)
app.use(cors());

const OPENAI_URL = "https://api.openai.com/v1";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!OPENAI_API_KEY) {
  console.warn("⚠️  OPENAI_API_KEY saknas. Sätt den i .env eller Render env vars.");
}

// Hälso-koll
app.get("/", (_, res) => res.send("✅ Whisper proxy online"));

// Chat-proxy (pass-through)
app.post("/chat", async (req, res) => {
  try {
    const response = await axios.post(
      `${OPENAI_URL}/chat/completions`,
      req.body,
      {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );
    res.json(response.data);
  } catch (err) {
    console.error("CHAT ERROR:", err?.response?.data || err.message);
    res.status(err?.response?.status || 500).json({
      error: err?.response?.data || err.message,
    });
  }
});

// Översättning med gpt-4o-mini
app.post("/translate", async (req, res) => {
  try {
    const { text, target = "English" } = req.body;
    const response = await axios.post(
      `${OPENAI_URL}/chat/completions`,
      {
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: `Translate to ${target}. Keep meaning and tone.` },
          { role: "user", content: text },
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );
    res.json(response.data.choices?.[0]?.message ?? {});
  } catch (err) {
    console.error("TRANSLATE ERROR:", err?.response?.data || err.message);
    res.status(err?.response?.status || 500).json({
      error: err?.response?.data || err.message,
    });
  }
});

// Transcribe: skicka base64-ljud från appen
// body: { audioBase64: "data:audio/wav;base64,...." eller bara ren base64, filename: "clip.wav" }
app.post("/transcribe", async (req, res) => {
  try {
    const { audioBase64, filename = "audio.wav", model = "whisper-1" } = req.body;
    if (!audioBase64) {
      return res.status(400).json({ error: "audioBase64 saknas i body" });
    }

    const base64 = audioBase64.includes(",")
      ? audioBase64.split(",").pop()
      : audioBase64;

    const buffer = Buffer.from(base64, "base64");

    const form = new FormData();
    form.append("file", buffer, { filename });
    form.append("model", model);

    const response = await axios.post(
      `${OPENAI_URL}/audio/transcriptions`,
      form,
      {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          ...form.getHeaders(),
        },
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
      }
    );

    res.json(response.data);
  } catch (err) {
    console.error("TRANSCRIBE ERROR:", err?.response?.data || err.message);
    res.status(err?.response?.status || 500).json({
      error: err?.response?.data || err.message,
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Proxy kör på port ${PORT}`);
});
