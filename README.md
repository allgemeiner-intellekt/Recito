# immersive-reader
A Chrome extension that read web pages out.

## Dev

```bash
npm install
npm run dev
```

In Chrome:
- `chrome://extensions`
- Enable "Developer mode"
- "Load unpacked" → select the generated `dist/` folder (after `npm run dev` / `npm run build`)

## Usage (MVP)

1. Open the extension Options page and configure:
   - OpenAI-compatible `apiEndpoint` (e.g. `https://api.openai.com/v1`)
   - `apiKey`
2. Open any article page, click the extension icon → "Listen to this page".
