# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

delegated: Chrome Manifest V3 extension. Vite + TypeScript + Preact (popup/options UI), vanilla content scripts, service worker for privileged work. bun as the package manager. Chosen because the repo was empty, the ask was a full extension, and Preact keeps the popup small without a React tax.

## Users

<!-- inferred from brief -->
Primary user: a job seeker at a laptop filling third-party application forms (Greenhouse, Lever, Workday, Ashby, company career sites). They already have a resume, a LinkedIn profile, and a pile of repeated identity/experience answers. They want the form filled, not a coaching product.

## Product Purpose

<!-- inferred from brief -->
Carbon is a local-first Chrome extension that stores a job-seeker's identity, experience, education, and resume on-device, then fills application fields via heuristic detection first and OpenRouter only for unmatched or long-form questions. Success is: a form is filled accurately from local data, AI is used only when heuristics are not enough, and secrets never leave the machine via export.

## Positioning

<!-- inferred from brief -->
The mechanism is a local dossier mapped onto whoever's form is on screen. Heuristics own structured fields (name, email, selects, job/experience repeaters). OpenRouter owns leftover questions. Neighboring "AI apply" tools reverse that: they send the page to a model first. Carbon does not.

## Operating Context

<!-- inferred from brief -->
Used primarily as a persistent browser side panel opened from Carbon's page-edge launcher, with a toolbar popup available for quick access and re-enabling. LinkedIn import happens on a LinkedIn profile tab. Resume arrives as a local file upload. OpenRouter is an optional user-supplied key. All profile data lives in `chrome.storage.local`. Export/import is a JSON file the user keeps.

## Capabilities and Constraints

Confirmed from the request:

- Fill text inputs, multiple-choice (select/radio/checkbox), experience/job repeater fields, and long-form questions.
- Basic (heuristic) detection plus AI fallback.
- Connect to OpenRouter for long-form / unmatched questions.
- Upload a resume and import identity/experience from LinkedIn.
- Store everything locally.
- Export and import profile data.
- OpenRouter keys must never appear in exported files.
- Persistent side panel opened from an in-page launcher, plus a popup UI on toolbar click.
- A global enable switch that hides the launcher and prevents fills while Carbon is off.

<!-- inferred -->
Undecided / assumed:

- Product name is **Carbon** (working name; not user-confirmed).
- LinkedIn import is DOM extraction from a profile page the user has open, not the official LinkedIn API (no OAuth app was specified).
- Resume parsing is local text extraction (PDF/DOCX) with optional OpenRouter structuring when a key exists.
- No account, no cloud backend, no telemetry.
- Fill is explicit (user clicks Fill or a shortcut), not silent auto-submit. The extension never submits the application.

## Brand Commitments

None specified. No existing name, logo, voice, or visual constraints beyond "nice, clean UI."

## Evidence on Hand

None. No real user resume, LinkedIn dump, or application screenshots were supplied. Demonstration profile data in the UI must be labeled synthetic. Do not fabricate customers, ATS partnerships, or accuracy claims.

## Product Principles

1. Local is the source of truth. The dossier never requires a server.
2. Heuristics before models. AI is a remainder handler, not the default fill path.
3. Secrets stay put. API keys are stored locally and stripped from every export.
4. The user fires the fill. The extension does not submit applications.
5. Structured identity is editable. Import is a start, not a lock.
