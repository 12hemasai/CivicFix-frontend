# CivicFix

CivicFix is a civic-tech web app that helps citizens identify visible public infrastructure problems and prepare a clear report for the authority that may be able to fix them. Upload a photo, enter the problem location, and receive a structured AI visual analysis without storing the uploaded image.

## Technology

- React with TypeScript
- Vite
- Tailwind CSS
- Wouter for lightweight routing
- Lucide React for interface icons
- OpenAI vision-capable chat completions through the CivicFix server route

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

## AI analysis setup

Stage 2 uses OpenAI `gpt-5.4-mini` for image analysis. The API key is used only by the API server; it is never included in frontend code or sent to the browser.

Required secret:

- `OPENAI_API_KEY` — an OpenAI API key with access to the selected model

In Replit, open the **Secrets** tool in the workspace, create a new secret named `OPENAI_API_KEY`, and paste the key there. Do not put the key in `README.md`, source files, or a committed `.env` file.

Once the secret is available, restart the `artifacts/api-server: API Server` workflow and the CivicFix web workflow if they are already running.

## Test image analysis

1. Start the configured API and CivicFix web workflows.
2. Open CivicFix in the preview.
3. Upload a JPG, PNG, or WebP image showing a visible civic problem.
4. Enter the problem location.
5. Click **Analyze Problem**.
6. Wait for the server-side vision request to finish.
7. Confirm the result shows the issue type, estimated severity, description, potential hazard, and visual confidence.
8. Try an unclear image to confirm the model can return an `uncertain` analysis.

The server validates the declared type, image signature, and 10 MB maximum size before sending the image for analysis. Uploaded images are held in memory for the request and are not permanently stored by CivicFix.

## Current scope

Web intelligence / SerpApi, database persistence, authentication, complaint generation, and authority lookup are not connected yet. The authority, evidence, and complaint sections remain placeholders for the next stages.