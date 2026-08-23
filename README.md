# js-page-digest-extension

A Manifest V3 browser extension that summarizes, simplifies, or bulletizes
the current page using Claude — streamed live into a small overlay panel on
the page itself, not a separate tab or popup you have to keep open.

## Why this exists

Most "AI page summarizer" extensions are a thin wrapper around a single
non-streaming API call. The interesting parts here are: keeping the API key
out of every web page's JS context (all requests happen in the background
service worker, which pages can't reach), relaying a server-sent-events
stream chunk-by-chunk across the extension's process boundary (background →
content script) over a `chrome.runtime.Port`, and caching results per URL so
re-opening a page you already summarized is instant.

## Architecture

```
background/background.js   Owns the API key and all network access. Holds a
                            long-lived port per request, streams the Anthropic
                            Messages API response, and forwards each text
                            delta to the content script as it arrives.
content/content.js         Injected on every page. Extracts readable text
                            (prefers <article>/<main>, falls back to <body>),
                            renders a floating Shadow DOM panel so host-page
                            CSS can't clash with it, and reads/writes the
                            per-URL cache in chrome.storage.local.
popup/                     Three buttons (Summarize / Simplify / Bullet
                            points) that message the active tab's content
                            script to start a run.
options/                   API key + model, stored in chrome.storage.local.
```

**Why the fetch lives in the background, not the content script:** a content
script executes inside the web page's JS realm — anything it does is at
least theoretically observable by that page. The background service worker
is a separate, page-inaccessible context, so the API key never enters a
context the visited site could reach.

## Setup

1. Open `chrome://extensions`, enable **Developer mode**, click **Load
   unpacked**, and select this directory.
2. Click the extension's options (right-click the icon → Options, or the
   "Set API key" link in the popup) and paste an Anthropic API key from
   [platform.claude.com/settings/keys](https://platform.claude.com/settings/keys).
3. Visit any page, click the extension icon, and pick a mode.

The key and chosen model are stored only in `chrome.storage.local` on your
machine — never synced, never sent anywhere except `api.anthropic.com`.

## How the streaming works

The Messages API is called directly from the browser with
`stream: true` and the `anthropic-dangerous-direct-browser-access: true`
header (required for any direct-from-browser call — without it the request
is rejected). The background worker reads the response body as raw
Server-Sent Events, parses `content_block_delta` events itself (no SDK
dependency — this is a small, unbundled MV3 extension), and posts each
`text_delta` chunk over the open port as it arrives. The content script just
appends whatever it receives to the panel.

## Model

Defaults to **`claude-haiku-4-5`** — Anthropic's fastest and cheapest
current model, which is plenty for page summarization/rewriting. A
`claude-sonnet-5` option is available in Settings for noticeably higher
quality at a higher per-token cost. See
[Anthropic's pricing](https://platform.claude.com/docs/en/pricing) for
current rates; a typical page summary is a few hundred input tokens (the
page text, capped at ~12,000 characters) and well under 1,024 output tokens,
so cost per run is a small fraction of a cent on Haiku.

## Caching

Each (URL, mode) pair is cached in `chrome.storage.local` after a successful
run, keyed by a cheap non-cryptographic hash (FNV-1a) of the URL — good
enough to avoid key collisions in practice for a local cache, not a security
boundary. Re-running the same mode on a page you've already summarized
loads instantly from cache; the panel's **Regenerate** button forces a fresh
API call.

## Known limitations

- No build step / bundler — this is intentionally plain JS with no
  dependencies, so the SSE parsing is hand-rolled rather than using the
  `@anthropic-ai/sdk` package (which would need bundling to run in a service
  worker).
- Page text extraction is a simple heuristic (`<article>`/`<main>` → `<body>`
  innerText), not a full readability algorithm — works well on most
  article-style pages, less well on heavily JS-rendered SPAs or pages
  without semantic HTML.
- Rate limits and per-key spend are whatever your Anthropic account's tier
  allows — see [Rate limits](https://platform.claude.com/docs/en/api/rate-limits).
