import "dotenv/config";
import express from "express";
import cors from "cors";
import multer from "multer";
import { OpenAI } from "openai";
import { logger } from "./logger.js";
import { requireBearer } from "./auth.js";
import { tidySchema, renderSchema } from "./validators.js";

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 }});
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.use(cors());
app.use(express.json());

// Health
app.get("/health", (_, res) => res.json({ ok: true }));

// Optional: rewrite/normalize the rep's free text into a strict instruction
app.post("/tidy", requireBearer, async (req, res) => {
  try {
    const { prompt } = tidySchema.parse(req.body);

    const system = [
      "You rewrite prompts for an image-edit model.",
      "Only allow changes to WINDOW frames, sashes, muntins/grids, and glass.",
      "Do not alter siding, brick, trim, doors, roof, sky, landscaping.",
      "Preserve perspective, lighting, and natural reflections in glass.",
      "Keep it concise and concrete."
    ].join(" ");

    const rsp = await client.responses.create({
      model: "gpt-4.1-mini", // pick your preferred text model
      input: [
        { role: "system", content: system },
        { role: "user", content: prompt }
      ]
    });

    const out = rsp.output_text ?? "Replace only windows with specified style and color.";
    res.json({ prompt: out });
  } catch (err) {
    logger.error({ err }, "tidy_failed");
    res.status(400).json({ error: err.message });
  }
});

// Natural-language image edit with the original photo as reference (no mask)
app.post("/render", requireBearer, upload.single("image"), async (req, res) => {
  try {
    const { prompt, n = "2", size = "1536x1536" } = renderSchema.parse(req.body);
    if (!req.file) return res.status(400).json({ error: "image file required" });

    // IMPORTANT: Some SDKs accept 'image[]' in multipart. With the official SDK:
    // Use 'images.generate' with model 'gpt-image-1' and pass the input image as a "reference".
    const imgBytes = req.file.buffer;

    const out = await client.images.generate({
      model: "gpt-image-1",
      prompt,
      // Many runtimes accept an array like this for reference inputs:
      image: [{ bytes: imgBytes }],
      n: Number(n),
      size
    });

    // Return base64s for the MVP (you can upload to S3 and return URLs instead)
    const images = out.data.map(d => d.b64_json);
    res.json({ images });
  } catch (err) {
    logger.error({ err }, "render_failed");
    res.status(400).json({ error: err.message });
  }
});

const port = process.env.PORT || 8787;
app.listen(port, () => logger.info(`rosati-render listening on :${port}`));