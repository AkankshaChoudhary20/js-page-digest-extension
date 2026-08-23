const API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const DEFAULT_MODEL = 'claude-haiku-4-5';
const MAX_OUTPUT_TOKENS = 1024;

const MODE_PROMPTS = {
  summarize:
    'Summarize the following page content in 3-5 concise sentences. Focus on the main point and key facts. Do not add a preamble like "Here is a summary" — start directly with the summary.',
  simplify:
    'Rewrite the following page content in plain, simple language a general audience can understand. Keep it to a few short paragraphs. Do not add a preamble — start directly with the rewrite.',
  bullets:
    'Extract the key points from the following page content as a concise Markdown bullet list (5-8 bullets max, one idea per bullet). Do not add a preamble — start directly with the list.',
};

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'page-digest-stream') return;

  port.onMessage.addListener((message) => {
    if (message.type === 'run') {
      runDigest(port, message).catch((err) => {
        safePost(port, { type: 'error', message: err instanceof Error ? err.message : String(err) });
      });
    }
  });
});

async function runDigest(port, { text, mode }) {
  const { apiKey, model } = await chrome.storage.local.get(['apiKey', 'model']);
  if (!apiKey) {
    safePost(port, { type: 'error', message: 'No API key set. Open the extension options to add one.' });
    return;
  }

  const instruction = MODE_PROMPTS[mode] ?? MODE_PROMPTS.summarize;
  const truncated = text.slice(0, 12000);

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: model || DEFAULT_MODEL,
      max_tokens: MAX_OUTPUT_TOKENS,
      stream: true,
      messages: [
        {
          role: 'user',
          content: `${instruction}\n\n---\n\n${truncated}`,
        },
      ],
    }),
  });

  if (!response.ok || !response.body) {
    const bodyText = await response.text().catch(() => '');
    let apiMessage = bodyText;
    try {
      apiMessage = JSON.parse(bodyText)?.error?.message ?? bodyText;
    } catch {
      // leave apiMessage as raw text
    }
    safePost(port, { type: 'error', message: `API error (${response.status}): ${apiMessage || response.statusText}` });
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (!payload) continue;

      let event;
      try {
        event = JSON.parse(payload);
      } catch {
        continue;
      }

      if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
        fullText += event.delta.text;
        safePost(port, { type: 'delta', text: event.delta.text });
      } else if (event.type === 'error') {
        safePost(port, { type: 'error', message: event.error?.message ?? 'Stream error' });
        return;
      }
    }
  }

  safePost(port, { type: 'done', fullText });
}

function safePost(port, message) {
  try {
    port.postMessage(message);
  } catch {
    // port likely disconnected (tab navigated away); nothing to do
  }
}
