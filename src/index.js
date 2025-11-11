// src/index.js
import "dotenv/config";
import express from "express";
import cors from "cors";
import multer from "multer";
import { OpenAI } from "openai";
import { toFile } from "openai/uploads";

import { logger } from "./logger.js";
import { requireBearer } from "./auth.js";
import { tidySchema, renderSchema } from "./validators.js";

const app = express();

// Increase if you want to allow larger photos later (e.g., 25 MB)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }
});

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.use(cors());
app.use(express.json());

// Health
app.get("/health", (_, res) => res.json({ ok: true }));

// Prompt normalizer (optional)
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
      model: "gpt-4.1-mini",
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
    // Multer attaches text fields to req.body and the file to req.file
    const { prompt, n = "2", size = "1536x1536" } = renderSchema.parse(req.body);
    if (!req.file) return res.status(400).json({ error: "image file required" });

    // Helpful debug (shows up in Render logs)
    logger.info({
      mimetype: req.file.mimetype,
      size: req.file.size,
      prompt,
      n,
      sizeParam: size
    }, "incoming_upload");

    // Create a File with the correct MIME type for the SDK
    const file = await toFile(
      req.file.buffer,
      "photo.jpg",
      { type: req.file?.mimetype || "image/jpeg" }
    );

    // Use the EDIT endpoint (singular)
    const out = await client.images.edit({
      model: "gpt-image-1",
      image: file,
      prompt,
      n: Number(n),
      size
    });

    const images = out.data.map(d => d.b64_json);
    res.json({ images });
  } catch (err) {
    logger.error({ err }, "render_failed");
    res.status(400).json({ error: err.message });
  }
});

const port = process.env.PORT || 8787;
app.listen(port, () => logger.info(`rosati-render listening on :${port}`));
