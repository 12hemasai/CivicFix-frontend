import { Router, type IRouter } from "express";
import { AnalyzeProblemBody, AnalyzeProblemResponse } from "@workspace/api-zod";

import multer from "multer";

const router: IRouter = Router();

const MAX_IMAGE_BYTES = 500 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_BYTES },
});
const SERPAPI_IMAGE_URL = "https://serpapi.com/image";
const SERPAPI_SEARCH_URL = "https://serpapi.com/search.json";

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

type LensEvidence = {
  titles: string[];
  snippets: string[];
  urls: string[];
  text: string;
};

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

function uniqueStrings(values: string[], limit = 8): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].slice(0, limit);
}

function addResultFields(value: unknown, evidence: LensEvidence): void {
  if (!isRecord(value)) return;
  if (typeof value.title === "string") evidence.titles.push(value.title);
  if (typeof value.name === "string") evidence.titles.push(value.name);
  if (typeof value.snippet === "string") evidence.snippets.push(value.snippet);
  if (typeof value.description === "string") evidence.snippets.push(value.description);
  if (typeof value.text === "string") evidence.snippets.push(value.text);
  if (typeof value.link === "string" && /^https?:\/\//i.test(value.link)) evidence.urls.push(value.link);
  if (typeof value.url === "string" && /^https?:\/\//i.test(value.url)) evidence.urls.push(value.url);
}

function getLensEvidence(payload: unknown): LensEvidence {
  const evidence: LensEvidence = { titles: [], snippets: [], urls: [], text: "" };
  if (!isRecord(payload)) return evidence;

  addResultFields(payload.knowledge_graph, evidence);
  addResultFields(payload.search_information, evidence);

  for (const key of ["visual_matches", "exact_matches", "related_content", "text_results", "image_results"]) {
    const values = payload[key];
    if (!Array.isArray(values)) continue;
    for (const value of values) addResultFields(value, evidence);
  }

  evidence.titles = uniqueStrings(evidence.titles);
  evidence.snippets = uniqueStrings(evidence.snippets);
  evidence.urls = uniqueStrings(evidence.urls);
  evidence.text = [...evidence.titles, ...evidence.snippets].join(" ").toLowerCase();
  return evidence;
}

function classifyLensEvidence(evidence: LensEvidence) {
  const candidates = [
    {
      issue_type: "pothole",
      terms: ["pothole", "road crater", "road hole", "pavement hole"],
      hazard: "A road depression or hole may create a collision, trip, or vehicle-damage risk.",
    },
    {
      issue_type: "damaged road",
      terms: ["damaged road", "road damage", "cracked asphalt", "broken pavement", "road surface"],
      hazard: "Visible road-surface damage may create a travel or vehicle-safety risk.",
    },
    {
      issue_type: "broken streetlight",
      terms: ["streetlight", "street light", "lamp post", "lamppost", "light pole"],
      hazard: "A non-functioning streetlight may reduce visibility and nighttime safety.",
    },
    {
      issue_type: "overflowing garbage bin",
      terms: ["overflowing bin", "overflowing garbage", "full garbage bin"],
      hazard: "Overflowing waste may create sanitation, odor, and obstruction risks.",
    },
    {
      issue_type: "garbage accumulation",
      terms: ["garbage", "trash", "litter", "waste pile", "rubbish"],
      hazard: "Accumulated waste may create sanitation, odor, and obstruction risks.",
    },
    {
      issue_type: "blocked drain",
      terms: ["blocked drain", "clogged drain", "storm drain", "gutter", "sewer"],
      hazard: "A blocked drain may increase localized flooding or water-safety risk.",
    },
    {
      issue_type: "damaged sidewalk",
      terms: ["damaged sidewalk", "broken sidewalk", "broken footpath", "damaged pavement"],
      hazard: "Damaged pedestrian surfaces may create a trip or accessibility risk.",
    },
    {
      issue_type: "fallen/obstructing object",
      terms: ["fallen tree", "fallen object", "obstruction", "debris", "blocked road"],
      hazard: "An obstruction may create a collision, access, or pedestrian-safety risk.",
    },
  ] as const;

  const scores = candidates
    .map((candidate) => ({
      candidate,
      score: candidate.terms.reduce(
        (score, term) => score + (evidence.text.includes(term) ? 1 : 0),
        0,
      ),
    }))
    .sort((left, right) => right.score - left.score);
  const best = scores[0];

  if (!best || best.score === 0) {
    return {
      issue_type: "uncertain" as const,
      severity: "low" as const,
      description:
        "Google Lens returned visual matches, but they did not provide enough reliable evidence to classify a civic problem.",
      potential_hazard: "Potential hazard could not be assessed from the available image evidence.",
      visual_confidence: 15,
    };
  }

  const visualConfidence = Math.min(90, best.score >= 2 ? 70 : 45);
  const supportingEvidence = uniqueStrings([...evidence.titles, ...evidence.snippets], 3).join(" · ");
  return {
    issue_type: best.candidate.issue_type,
    severity: (visualConfidence >= 65 ? "medium" : "low") as (typeof SEVERITIES)[number],
    description: `Google Lens evidence suggests ${best.candidate.issue_type}. This is based on visual matches and returned text, not a definitive civic classification.${supportingEvidence ? ` Evidence: ${supportingEvidence}` : ""}`,
    potential_hazard: visualConfidence >= 65 ? best.candidate.hazard : "Needs manual assessment because Lens evidence is limited.",
    visual_confidence: visualConfidence,
  };
}

async function uploadImage(imageBuffer: Buffer, mimeType: string, apiKey: string): Promise<string> {
  const form = new FormData();
  const imageBytes = new Uint8Array(imageBuffer.length);
  imageBytes.set(imageBuffer);
  form.append(
    "image",
    new Blob([imageBytes.buffer as ArrayBuffer], { type: mimeType }),
    `civicfix-upload.${mimeType.split("/")[1]}`,
  );
  form.append("api_key", apiKey);

  const response = await fetch(SERPAPI_IMAGE_URL, {
    method: "POST",
    body: form,
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`SerpApi image upload returned HTTP ${response.status}`);

  const payload = (await response.json()) as unknown;
  if (!isRecord(payload) || typeof payload.image_id !== "string" || payload.image_id.length === 0) {
    throw new Error("SerpApi image upload did not return an image_id");
  }
  return payload.image_id;
}

async function searchGoogleLens(imageId: string, apiKey: string): Promise<LensEvidence> {
  const params = new URLSearchParams({
    engine: "google_lens",
    image_id: imageId,
    type: "all",
    country: "in",
    hl: "en",
    api_key: apiKey,
  });
  const response = await fetch(`${SERPAPI_SEARCH_URL}?${params.toString()}`, {
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`SerpApi Google Lens returned HTTP ${response.status}`);

  const payload = (await response.json()) as unknown;
  if (isRecord(payload) && typeof payload.error === "string") {
    throw new Error("SerpApi Google Lens returned an error response");
  }
  return getLensEvidence(payload);
}

router.post("/analyze-problem", upload.single("image"), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "Provide a JPG, PNG, or WebP image to analyze." });
    return;
  }

  const mimeType = req.file.mimetype;
  const imageBuffer = req.file.buffer;

  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    res.status(400).json({ error: "Only JPG, PNG, and WebP images are supported." });
    return;
  }

  if (imageBuffer.length === 0 || imageBuffer.length > MAX_IMAGE_BYTES) {
    res.status(413).json({ error: "Google Lens accepts images up to 500 KB." });
    return;
  }

  if (!hasImageSignature(imageBuffer, mimeType)) {
    res.status(400).json({ error: "The uploaded file does not match its image type." });
    return;
  }

  const apiKey = process.env.SERPAPI_KEY?.trim();
  if (!apiKey) {
    res.status(422).json({ error: "SerpApi image analysis is not configured yet." });
    return;
  }

  try {
    const imageId = await uploadImage(imageBuffer, mimeType, apiKey);
    const evidence = await searchGoogleLens(imageId, apiKey);
    const result = classifyLensEvidence(evidence);
    const validatedResult = AnalyzeProblemResponse.safeParse(result);
    if (!validatedResult.success) {
      req.log.error("SerpApi Google Lens result failed response validation");
      res.status(422).json({ error: "The image analysis response was incomplete." });
      return;
    }

    res.json(validatedResult.data);
  } catch (error) {
    req.log.error({ err: error }, "SerpApi image analysis failed");
    const message = String(error);
    if (message.includes("HTTP 401") || message.includes("HTTP 403")) {
      res.status(422).json({ error: "The SerpApi key was rejected. Update SERPAPI_KEY in Replit Secrets." });
      return;
    }
    res.status(422).json({ error: "SerpApi image analysis is temporarily unavailable." });
  }
});

export default router;