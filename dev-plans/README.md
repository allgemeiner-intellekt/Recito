# Immersive Reader — Dev Plans

Sequential implementation plans derived from the [PRD](../Immersive_Reader_PRD.docx). Each plan has well-defined exit criteria and tangible deliverables. Implement them in order — dependency arrows shown below.

## Plan Overview

| # | Plan | Effort | Phase |
|---|------|--------|-------|
| 00 | [Project Scaffold & Build Pipeline](00-project-scaffold.md) | 1–2 days | v1.0 |
| 01 | [Provider Adapters & BYOK Storage](01-provider-adapters-and-byok-storage.md) | 3–4 days | v1.0 |
| 02 | [Content Extraction & Chunking](02-content-extraction.md) | 2–3 days | v1.0 |
| 03 | [Audio Pipeline & Playback Engine](03-audio-pipeline-and-playback.md) | 4–5 days | v1.0 |
| 04 | [Floating Reader Toolbar](04-floating-toolbar.md) | 3–4 days | v1.0 |
| 05 | [Popup UI & Settings Page](05-popup-and-settings-ui.md) | 4–5 days | v1.0 |
| 06 | [Word & Sentence Highlighting](06-word-sentence-highlighting.md) | 3–4 days | v1.0 |
| 07 | [Onboarding & v1.0 Release](07-onboarding-and-v1-release.md) | 3–4 days | v1.0 |
| 08 | [Queue, PDF & Background Audio](08-v1.1-queue-pdf-background.md) | 5–6 days | v1.1 |
| 09 | [Power Features](09-v1.2-power-features.md) | 6–8 days | v1.2 |

## Dependency Graph

```
00 Project Scaffold
├── 01 Provider Adapters & Storage
│   ├── 03 Audio Pipeline ←── 02 Content Extraction
│   │   ├── 04 Floating Toolbar
│   │   └── 06 Highlighting ←── 02
│   └── 05 Popup & Settings
├── 02 Content Extraction
│
07 Onboarding & Release ←── all of 00–06
08 v1.1 Features ←── 07
09 v1.2 Features ←── 08
```

Plans 01 and 02 can be developed **in parallel** after Plan 00 is complete. Plans 04, 05, and 06 can also be parallelized once their dependencies are met.

## How to Use

1. Start with Plan 00 — get the build pipeline working
2. Work through plans sequentially (or in parallel where dependencies allow)
3. Check off exit criteria as you complete each task
4. Plans 07 wraps up v1.0; Plans 08–09 are post-launch
