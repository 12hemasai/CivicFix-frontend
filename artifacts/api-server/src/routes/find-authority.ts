import { Router, type IRouter } from "express";
import { FindAuthorityBody, FindAuthorityResponse } from "@workspace/api-zod";

const router: IRouter = Router();

const SERPAPI_URL = "https://serpapi.com/search.json";
const NO_AUTHORITY = "Authority could not be confidently identified.";
const NO_CONTACT = "No official contact information was found in the returned sources.";

type SupportingSource = {
  title: string;
  url: string;
  snippet: string;
};

type SerpApiResult = {
  title?: unknown;
  link?: unknown;
  snippet?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isOfficialUrl(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return hostname.endsWith(".gov.in") || hostname.endsWith(".nic.in") || hostname.endsWith(".gov");
  } catch {
    return false;
  }
}

function toSource(result: SerpApiResult): SupportingSource | null {
  if (typeof result.title !== "string" || typeof result.link !== "string") return null;
  if (!/^https?:\/\//i.test(result.link)) return null;

  return {
    title: result.title.trim(),
    url: result.link.trim(),
    snippet: typeof result.snippet === "string" ? result.snippet.trim() : "",
  };
}

function getOrganicResults(payload: unknown): SupportingSource[] {
  if (!isRecord(payload) || !Array.isArray(payload.organic_results)) return [];

  return payload.organic_results
    .filter((result): result is SerpApiResult => isRecord(result))
    .map(toSource)
    .filter((source): source is SupportingSource => source !== null && source.title.length > 0);
}

function dedupeSources(sources: SupportingSource[]): SupportingSource[] {
  const seen = new Set<string>();
  return sources.filter((source) => {
    const key = source.url.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function extractAuthority(sources: SupportingSource[]): string | null {
  const authorityPattern =
    /\b([A-Z][A-Za-z.'-]*(?:\s+[A-Z][A-Za-z.'-]*){0,5}\s+(?:Municipal Corporation|Municipality|Municipal Council|Nagar Palika|Nagar Panchayat|Panchayat|Public Works Department|Roads (?:and|&) Buildings Department))\b/g;

  for (const source of sources) {
    const text = `${source.title} ${source.snippet}`;
    const match = authorityPattern.exec(text);
    authorityPattern.lastIndex = 0;
    if (match?.[1]) return match[1].trim();
  }

  for (const source of sources) {
    if (!/(municipal|public works|panchayat|roads and buildings)/i.test(source.title)) continue;
    const title = source.title.split(/\s*[|–—-]\s*/)[0]?.trim();
    if (title && title.length <= 140) return title;
  }

  return null;
}

function findReportingUrl(sources: SupportingSource[]): string {
  const source = sources.find(
    (candidate) =>
      isOfficialUrl(candidate.url) &&
      /(complaint|complaints|grievance|feedback|lodge|register.*complaint|citizen[\s-]*(?:services|portal|charter))/i.test(
        `${candidate.title} ${candidate.snippet} ${candidate.url}`,
      ),
  );
  return source?.url ?? "";
}

function extractContactInformation(sources: SupportingSource[]): string {
  const text = sources
    .filter((source) => isOfficialUrl(source.url))
    .map((source) => `${source.title} ${source.snippet}`)
    .join(" ");
  const emails = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? [];
  const mobileNumbers = text.match(/(?:\+91[\s-]?)?[6-9]\d{9}\b/g) ?? [];
  const contacts = [...new Set([...emails, ...mobileNumbers])];
  return contacts.length > 0 ? contacts.join(" · ") : NO_CONTACT;
}

function buildQueries(issueType: string, location: string): string[] {
  return [
    `site:gov.in "${location}" "${issueType}" complaint road department`,
    `site:gov.in "${location}" municipal complaint "${issueType}"`,
    `"${location}" official complaint "${issueType}" municipality`,
  ];
}

async function searchSerpApi(
  query: string,
  apiKey: string,
): Promise<SupportingSource[]> {
  const params = new URLSearchParams({
    engine: "google",
    q: query,
    api_key: apiKey,
    num: "10",
    hl: "en",
    gl: "in",
  });
  const response = await fetch(`${SERPAPI_URL}?${params.toString()}`, {
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    throw new Error(`SerpApi returned HTTP ${response.status}`);
  }

  const payload = (await response.json()) as unknown;
  if (isRecord(payload) && typeof payload.error === "string") {
    throw new Error("SerpApi returned an error response");
  }
  return getOrganicResults(payload);
}

router.post("/find-authority", async (req, res) => {
  const parsedInput = FindAuthorityBody.safeParse(req.body);
  if (!parsedInput.success) {
    res.status(400).json({ error: "Provide an issue type and problem location." });
    return;
  }

  const apiKey = process.env.SERPAPI_KEY?.trim();
  if (!apiKey) {
    res.status(503).json({ error: "Authority search is not configured yet." });
    return;
  }

  const { issue_type: issueType, location } = parsedInput.data;
  const queries = buildQueries(issueType, location);

  try {
    const queryResults = await Promise.allSettled(
      queries.map((query) => searchSerpApi(query, apiKey)),
    );
    const rejected = queryResults.filter(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );
    const successfulSources = queryResults
      .filter(
        (result): result is PromiseFulfilledResult<SupportingSource[]> =>
          result.status === "fulfilled",
      )
      .flatMap((result) => result.value);

    if (successfulSources.length === 0) {
      const hasCredentialError = rejected.some((result) =>
        String(result.reason).includes("HTTP 401"),
      );
      res.status(503).json({
        error: hasCredentialError
          ? "The SerpApi key was rejected. Update SERPAPI_KEY in Replit Secrets."
          : "Authority search is temporarily unavailable.",
      });
      return;
    }

    const sources = dedupeSources(successfulSources).sort(
      (left, right) => Number(isOfficialUrl(right.url)) - Number(isOfficialUrl(left.url)),
    );
    const officialSources = sources.filter((source) => isOfficialUrl(source.url));
    const authority = extractAuthority(officialSources);
    const reportingUrl = findReportingUrl(officialSources);
    const contactInformation = extractContactInformation(officialSources);
    const confidence =
      authority && officialSources.length >= 2 && reportingUrl
        ? "high"
        : authority && officialSources.length > 0
          ? "medium"
          : "low";

    const result = {
      likely_authority: authority ?? NO_AUTHORITY,
      confidence,
      explanation: authority
        ? `Official search results suggest ${authority} may be the likely starting point for a ${issueType} report in ${location}. This is a likely authority based on returned web evidence, not a confirmed legal responsibility.`
        : `Authority could not be confidently identified. The returned search evidence did not name a clear official department for a ${issueType} in ${location}.`,
      official_reporting_url: reportingUrl,
      contact_information: contactInformation,
      supporting_sources: sources.slice(0, 5),
    };

    const validatedResult = FindAuthorityResponse.safeParse(result);
    if (!validatedResult.success) {
      req.log.error("SerpApi authority result failed response validation");
      res.status(503).json({ error: "The authority search response was incomplete." });
      return;
    }

    res.json(validatedResult.data);
  } catch (error) {
    req.log.error({ err: error }, "Unexpected authority search error");
    res.status(503).json({ error: "Authority search is temporarily unavailable." });
  }
});

export default router;