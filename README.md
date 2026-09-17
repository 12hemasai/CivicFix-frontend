# CivicFix

CivicFix is a civic-tech web app that helps citizens identify visible public infrastructure problems and prepare a clear report for the authority that may be able to fix them. Upload a photo, enter the problem location, and receive a structured AI visual analysis without storing the uploaded image.

## Technology

- React with TypeScript
- Vite
- Tailwind CSS
- Wouter for lightweight routing
- Lucide React for interface icons
- SerpApi Image API and Google Lens through the CivicFix server route

## Install dependencies

From the project root:

```bash
pnpm install
```

## Run locally

Start the CivicFix web app with the configured workflow in Replit:

```bash
pnpm --filter @workspace/civicfix run dev
```

For a manual local Vite run, provide the port and base path expected by the app:

```bash
PORT=5173 BASE_PATH=/ pnpm --filter @workspace/civicfix run dev
```

## SerpApi image analysis setup

CivicFix uses SerpApi for both image intelligence and web research. The server uploads the image to SerpApi's Image API, uses the temporary `image_id` with Google Lens, then searches official web sources for authority evidence. Lens results are evidence, not guaranteed truth.

Required secret:

- `SERPAPI_KEY` — a SerpApi private API key

In Replit, open the **Secrets** tool in the workspace, create a new secret named `SERPAPI_KEY`, and paste the key there. Do not put the key in `README.md`, source files, or a committed `.env` file.

Once the secret is available, restart the `artifacts/api-server: API Server` workflow and the CivicFix web workflow if they are already running.

## Test image analysis

1. Start the configured API and CivicFix web workflows.
2. Open CivicFix in the preview.
3. Upload a JPG, PNG, or WebP image showing a visible civic problem.
4. Enter the problem location.
5. Click **Analyze Problem**.
6. Wait for the image upload, Google Lens search, and authority search to finish.
7. Confirm the result shows the Lens-supported problem evidence, location, authority confidence, explanation, and clickable sources.
8. Try an unclear image to confirm the result says that manual assessment is needed rather than inventing a classification.

The server validates the declared type, image signature, and 500 KB maximum size before sending the image to SerpApi. The uploaded image is held in memory for the request; the temporary SerpApi image ID expires after the provider's retention window and is not stored permanently by CivicFix.

## Current scope

Database persistence and authentication are not connected yet.
The current MVP supports:
- Civic issue image analysis
- Location-based investigation
- SerpApi and Google Lens search
- Authority discovery
- Evidence and source presentation
- Reporting channel discovery
- Complaint generation
