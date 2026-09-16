import { Router, type IRouter } from "express";
import { AnalyzeProblemBody, AnalyzeProblemResponse } from "@workspace/api-zod";

const router: IRouter = Router();

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const OPENAI_MODEL = "gpt-5.4-mini";
const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const ISSUE_TYPES = [
  "pothole",
  "damaged road",
  "broken streetlight",
  "garbage accumulation",
  "overflowing garbage bin",
  "blocked drain",
  "damaged sidewalk",
  "fallen/obstructing object",
  "other visible civic infrastructure problem",
  "uncertain",
] as const;
const SEVERITIES = ["low", "medium", "high"] as const;

const analysisSchema = {
  type: "object",
  properties: {
    issue_type: { type: "string", enum: ISSUE_TYPES },
    severity: { type: "string", enum: SEVERITIES },
    description: { type: "string" },
    potential_hazard: { type: "string" },
    visual_confidence: { type: "integer", minimum: 0, maximum: 100 },
  },
  required: [
    "issue_type",
    "severity",
    "description",
    "potential_hazard",
    "visual_confidence",
  ],
  additionalProperties: false,
} as const;

const SYSTEM_PROMPT = `You are CivicFix's visual civic-infrastructure analyst.

Analyze only what is visually supported by the supplied image. Do not infer facts that cannot be seen, do not identify a responsible authority, and do not claim the image proves legal responsibility. Severity is only an estimate based on visible conditions.

Return one JSON object matching the provided schema. Use issue_type "uncertain" when the image is unclear, does not show a civic problem, or does not provide enough visual evidence. For uncertain images, use a low confidence score and explain the limitation in description and potential_hazard.`;

const USER_PROMPT = `Classify the visible civic problem, if any. Supported issue types are pothole, damaged road, broken streetlight, garbage accumulation, overflowing garbage bin, blocked drain, damaged sidewalk, fallen/obstructing object, other visible civic infrastructure problem, or uncertain.

Keep description and potential_hazard grounded in visible details. Do not mention a responsible authority.`;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function hasImageSignature(buffer: Buffer, mimeType: string): boolean {
  if (mimeType === "image/jpeg") {
    return buffer.length >= 3 && buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]));
  }
  if (mimeType === "image/png") {
    return (
      buffer.length >= 8 &&
      buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    );
  }
  return (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  );
}

function parseModelContent(content: unknown): unknown {
  if (typeof content !== "string") return null;
  const normalized = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(normalized) as unknown;
  } catch {
    return null;
  }
}

function getOpenAiContent(payload: unknown): unknown {
  if (!isRecord(payload) || !Array.isArray(payload.choices)) return null;
  const firstChoice = payload.choices[0];
  if (!isRecord(firstChoice) || !isRecord(firstChoice.message)) return null;
  return parseModelContent(firstChoice.message.content);
}

router.post("/analyze-problem", async (req, res) => {
  const parsedInput = AnalyzeProblemBody.safeParse(req.body);
  if (!parsedInput.success) {
    res.status(400).json({ error: "Provide a JPG, PNG, or WebP image to analyze." });
    return;
  }

  const { mimeType, imageBase64 } = parsedInput.data;
  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    res.status(400).json({ error: "Only JPG, PNG, and WebP images are supported." });
    return;
  }

  let imageBuffer: Buffer;
  try {
    imageBuffer = Buffer.from(imageBase64, "base64");
  } catch {
    res.status(400).json({ error: "The uploaded image could not be read." });
    return;
  }

  if (imageBuffer.length === 0 || imageBuffer.length > MAX_IMAGE_BYTES) {
    res.status(413).json({ error: "Images must be smaller than 10 MB." });
    return;
  }

  if (!hasImageSignature(imageBuffer, mimeType)) {
    res.status(400).json({ error: "The uploaded file does not match its image type." });
    return;
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    res.status(503).json({ error: "Image analysis is not configured yet." });
    return;
  }

  try {
    const openAiResponse = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              { type: "text", text: USER_PROMPT },
              {
                type: "image_url",
                image_url: {
                  url: `data:${mimeType};base64,${imageBase64}`,
                  detail: "high",
                },
              },
            ],
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "civic_problem_analysis",
            strict: true,
            schema: analysisSchema,
          },
        },
        max_completion_tokens: 600,
      }),
    });

    if (!openAiResponse.ok) {
      req.log.error(
        { statusCode: openAiResponse.status },
        "OpenAI image analysis request failed",
      );
      if (openAiResponse.status === 401 || openAiResponse.status === 403) {
        res.status(503).json({
          error: "The OpenAI API key was rejected. Update OPENAI_API_KEY in Replit Secrets.",
        });
        return;
      }
      res.status(503).json({ error: "Image analysis is temporarily unavailable." });
      return;
    }

    const openAiPayload = (await openAiResponse.json()) as unknown;
    const validatedResult = AnalyzeProblemResponse.safeParse(getOpenAiContent(openAiPayload));
    if (!validatedResult.success) {
      req.log.error("OpenAI returned an invalid civic analysis shape");
      res.status(503).json({ error: "The image analysis response was incomplete." });
      return;
    }

    res.json(validatedResult.data);
  } catch (error) {
    req.log.error({ err: error }, "Unexpected image analysis error");
    res.status(503).json({ error: "Image analysis is temporarily unavailable." });
  }
});

export default router;