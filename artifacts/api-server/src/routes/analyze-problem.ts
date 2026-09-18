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
  sources: string[];
  text: string;
  totalMatches: number;
  hasExactMatches: boolean;
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

function uniqueStrings(values: string[], limit?: number): string[] {
  const unique = [...new Set(values.map((value) => value.trim()).filter(Boolean))];
  return typeof limit === "number" ? unique.slice(0, limit) : unique;
}

function extractUrlWords(url: string): string {
  try {
    const parsed = new URL(url);
    return decodeURIComponent(parsed.pathname).replace(/[-_./?=&%0-9]+/g, " ");
  } catch {
    return "";
  }
}

function addResultFields(value: unknown, evidence: LensEvidence): void {
  if (!isRecord(value)) return;
  if (typeof value.title === "string") evidence.titles.push(value.title);
  if (typeof value.name === "string") evidence.titles.push(value.name);
  if (typeof value.snippet === "string") evidence.snippets.push(value.snippet);
  if (typeof value.description === "string") evidence.snippets.push(value.description);
  if (typeof value.text === "string") evidence.snippets.push(value.text);
  if (typeof value.source === "string") evidence.sources.push(value.source);
  if (typeof value.link === "string" && /^https?:\/\//i.test(value.link)) evidence.urls.push(value.link);
  if (typeof value.url === "string" && /^https?:\/\//i.test(value.url)) evidence.urls.push(value.url);
}

function getLensEvidence(payload: unknown): LensEvidence {
  const evidence: LensEvidence = {
    titles: [],
    snippets: [],
    urls: [],
    sources: [],
    text: "",
    totalMatches: 0,
    hasExactMatches: false,
  };
  if (!isRecord(payload)) return evidence;

  addResultFields(payload.knowledge_graph, evidence);
  addResultFields(payload.search_information, evidence);
  addResultFields(payload.search_parameters, evidence);
  addResultFields(payload.ai_overview, evidence);
  addResultFields(payload.reverse_image_search, evidence);

  if (Array.isArray(payload.exact_matches) && payload.exact_matches.length > 0) {
    evidence.hasExactMatches = true;
    for (const value of payload.exact_matches) addResultFields(value, evidence);
  }

  for (const key of ["visual_matches", "related_content", "text_results", "image_results", "organic_results"]) {
    const values = payload[key];
    if (!Array.isArray(values)) continue;
    if (key === "visual_matches") {
      evidence.totalMatches += values.length;
    }
    for (const value of values) addResultFields(value, evidence);
  }

  evidence.titles = uniqueStrings(evidence.titles);
  evidence.snippets = uniqueStrings(evidence.snippets);
  evidence.urls = uniqueStrings(evidence.urls);
  evidence.sources = uniqueStrings(evidence.sources);

  const urlWords = evidence.urls.map(extractUrlWords).join(" ");
  evidence.text = [
    ...evidence.titles,
    ...evidence.snippets,
    ...evidence.sources,
    urlWords,
  ]
    .join(" ")
    .toLowerCase();

  return evidence;
}

function classifyLensEvidence(evidence: LensEvidence) {
  const candidates = [
    {
      issue_type: "pothole" as const,
      primaryTerms: [
        "pothole",
        "potholes",
        "pot hole",
        "pot holes",
        "pot-hole",
        "pot-holes",
        "road crater",
        "road hole",
        "road holes",
        "pavement hole",
        "street hole",
        "hole in the road",
        "hole in road",
        "hole in street",
        "asphalt hole",
        "pothole repair",
        "pothole patch",
        "pothole damage",
        "pothole claims",
      ],
      secondaryTerms: [
        "road damage",
        "damaged road",
        "pavement damage",
        "damaged pavement",
        "road crack",
        "road cracks",
        "pavement crack",
        "pavement cracks",
        "cracked asphalt",
        "cracked road",
        "asphalt damage",
        "asphalt crack",
        "asphalt cracking",
        "broken pavement",
        "broken road",
        "alligator cracking",
        "road depression",
        "street damage",
        "sinkhole",
        "road cavity",
        "depression in road",
        "uneven road",
      ],
      hazard: "A road depression or hole may create a collision, trip, or vehicle-damage risk.",
    },
    {
      issue_type: "damaged road" as const,
      primaryTerms: [
        "damaged road",
        "road damage",
        "cracked asphalt",
        "broken pavement",
        "road crack",
        "road cracks",
        "alligator cracking",
        "road surface damage",
        "broken road",
        "cracked pavement",
        "asphalt damage",
        "pavement damage",
        "road defect",
      ],
      secondaryTerms: ["asphalt", "tarmac", "pavement", "street surface", "road repair", "macadam"],
      hazard: "Visible road-surface damage may create a travel or vehicle-safety risk.",
    },
    {
      issue_type: "damaged sidewalk" as const,
      primaryTerms: [
        "damaged sidewalk",
        "broken sidewalk",
        "broken footpath",
        "damaged pavement",
        "cracked sidewalk",
        "sidewalk crack",
        "footpath damage",
        "damaged walkway",
        "pavement trip hazard",
        "uneven sidewalk",
        "broken curb",
        "broken kerb",
      ],
      secondaryTerms: ["sidewalk", "footpath", "walkway", "curb", "kerb"],
      hazard: "Damaged pedestrian surfaces may create a trip or accessibility risk.",
    },
    {
      issue_type: "broken streetlight" as const,
      primaryTerms: [
        "broken streetlight",
        "streetlight",
        "street light",
        "streetlights",
        "lamp post",
        "lamppost",
        "light pole",
        "street lamp",
        "broken lamp",
        "faulty streetlight",
      ],
      secondaryTerms: ["light fixture", "illumination pole"],
      hazard: "A non-functioning streetlight may reduce visibility and nighttime safety.",
    },
    {
      issue_type: "overflowing garbage bin" as const,
      primaryTerms: [
        "overflowing bin",
        "overflowing garbage",
        "overflowing trash",
        "full garbage bin",
        "dumpster overflow",
        "overflowing waste",
      ],
      secondaryTerms: ["dumpster", "trash can", "garbage can", "rubbish bin"],
      hazard: "Overflowing waste may create sanitation, odor, and obstruction risks.",
    },
    {
      issue_type: "garbage accumulation" as const,
      primaryTerms: [
        "garbage accumulation",
        "garbage pile",
        "trash pile",
        "waste pile",
        "litter",
        "rubbish",
        "dumped trash",
        "illegal dumping",
        "accumulated waste",
        "refuse pile",
        "garbage dump",
      ],
      secondaryTerms: ["garbage", "trash", "waste", "rubbish", "dumping", "refuse"],
      hazard: "Accumulated waste may create sanitation, odor, and obstruction risks.",
    },
    {
      issue_type: "blocked drain" as const,
      primaryTerms: [
        "blocked drain",
        "clogged drain",
        "storm drain",
        "blocked sewer",
        "clogged sewer",
        "drain blockage",
        "waterlogging",
        "street flooding",
        "blocked catch basin",
      ],
      secondaryTerms: ["storm drain", "catch basin", "culvert", "manhole", "sewer", "drainage"],
      hazard: "A blocked drain may increase localized flooding or water-safety risk.",
    },
    {
      issue_type: "fallen/obstructing object" as const,
      primaryTerms: [
        "fallen tree",
        "fallen branch",
        "fallen object",
        "obstruction",
        "road obstruction",
        "debris on road",
        "fallen pole",
        "fallen wire",
      ],
      secondaryTerms: ["branch", "tree trunk", "barrier", "obstruction", "debris"],
      hazard: "An obstruction may create a collision, access, or pedestrian-safety risk.",
    },
  ] as const;

  const scores = candidates
    .map((candidate) => {
      const primaryMatches = candidate.primaryTerms.filter((term) => evidence.text.includes(term));
      const secondaryMatches = candidate.secondaryTerms.filter((term) => evidence.text.includes(term));
      const score = primaryMatches.length * 3 + secondaryMatches.length;
      return {
        candidate,
        primaryCount: primaryMatches.length,
        secondaryCount: secondaryMatches.length,
        score,
      };
    })
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

  // Visual confidence represents Lens optical pattern similarity, decoupled from issue identification.
  // Low visual confidence (e.g. 15%-45%) denotes limited visual-search matches, not an uncertain issue.
  let visualConfidence = 15;
  if (evidence.hasExactMatches) {
    visualConfidence = 75;
  } else if (evidence.totalMatches >= 10 && best.primaryCount >= 2) {
    visualConfidence = 55;
  } else if (evidence.totalMatches >= 3 && (best.primaryCount >= 1 || best.secondaryCount >= 2)) {
    visualConfidence = 45;
  } else if (best.score > 0) {
    visualConfidence = 15;
  }

  // Keep severity conservative. If visual confidence is low, severity is conservative ('low'),
  // which causes the client UI to display 'Needs manual assessment'.
  const supportingEvidence = uniqueStrings([...evidence.titles, ...evidence.snippets], 3).join(" · ");
  const evidenceDetails = supportingEvidence ? ` Evidence: ${supportingEvidence}` : "";

  return {
    issue_type: best.candidate.issue_type,
    severity: "low" as (typeof SEVERITIES)[number],
    description: `Google Lens visual-search evidence supports ${best.candidate.issue_type}. Lens/search-supported.${evidenceDetails}`,
    potential_hazard: `${best.candidate.hazard} (Needs manual assessment to confirm on-site depth and hazard level).`,
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