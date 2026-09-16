# CivicFix

CivicFix is a civic-tech frontend that helps citizens identify visible public infrastructure problems and prepare a clear report for the authority that may be able to fix them. The first development stage focuses on the reporting experience: upload a photo, enter the problem location, and review a clearly labeled demo analysis.

## Technology

- React with TypeScript
- Vite
- Tailwind CSS
- Wouter for lightweight routing
- Lucide React for interface icons

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

The app supports JPG, PNG, and WebP image uploads, shows a local preview, accepts a manually entered location, and displays a realistic loading state before showing the demo result.

## Current scope

This is the frontend foundation only. AI analysis, web intelligence / SerpApi, database persistence, authentication, and external integrations are not connected yet. The demo analysis is intentionally labeled and structured so it can be replaced by a real API in a later stage.