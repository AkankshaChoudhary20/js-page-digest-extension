(() => {
  const HOST_ID = 'page-digest-extension-host';
  let shadowRoot = null;
  let bodyEl = null;
  let statusEl = null;
  let activePort = null;

  function fnv1a(str) {
    let hash = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(36);
  }

  function cacheKey(mode) {
    return `digest:${mode}:${fnv1a(location.href)}`;
  }

  function extractPageText() {
    const preferred = document.querySelector('article') || document.querySelector('main');
    const source = preferred || document.body;
    const clone = source.cloneNode(true);
    clone.querySelectorAll('script, style, noscript, nav, header, footer, aside').forEach((el) => el.remove());
    return clone.innerText.replace(/\n{3,}/g, '\n\n').trim();
  }

  function ensurePanel() {
    if (shadowRoot) return;
    const host = document.createElement('div');
    host.id = HOST_ID;
    host.style.all = 'initial';
    host.style.position = 'fixed';
    host.style.top = '16px';
    host.style.right = '16px';
    host.style.zIndex = '2147483647';
    document.documentElement.appendChild(host);

    shadowRoot = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = `
      .panel {
        width: 360px;
        max-height: 70vh;
        display: flex;
        flex-direction: column;
        background: #1a1b20;
        color: #e7e8ec;
        border: 1px solid #33363f;
        border-radius: 10px;
        box-shadow: 0 8px 24px rgba(0,0,0,0.4);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        font-size: 13px;
        overflow: hidden;
      }
      .header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 8px 10px;
        background: #23242b;
        border-bottom: 1px solid #33363f;
      }
      .title {
        font-weight: 600;
        font-size: 12px;
      }
      .status {
        color: #9297a3;
        font-size: 11px;
        padding: 4px 10px;
        border-bottom: 1px solid #262731;
      }
      .actions button {
        background: none;
        border: none;
        color: #9297a3;
        cursor: pointer;
        font-size: 13px;
        padding: 2px 6px;
      }
      .actions button:hover {
        color: #e7e8ec;
      }
      .body {
        padding: 10px;
        overflow-y: auto;
        line-height: 1.5;
        white-space: pre-wrap;
      }
      .footer {
        display: flex;
        gap: 6px;
        padding: 8px 10px;
        border-top: 1px solid #33363f;
      }
      .footer button {
        background: #262932;
        border: 1px solid #33363f;
        color: #e7e8ec;
        border-radius: 6px;
        padding: 4px 8px;
        font-size: 12px;
        cursor: pointer;
      }
      .footer button:hover {
        border-color: #6d8cff;
      }
      .error {
        color: #e06d6d;
      }
    `;

    const panel = document.createElement('div');
    panel.className = 'panel';
    panel.innerHTML = `
      <div class="header">
        <span class="title">Page Digest</span>
        <div class="actions">
          <button data-action="close" title="Close">✕</button>
        </div>
      </div>
      <div class="status"></div>
      <div class="body"></div>
      <div class="footer">
        <button data-action="regenerate">Regenerate</button>
        <button data-action="copy">Copy</button>
      </div>
    `;

    panel.querySelector('[data-action="close"]').addEventListener('click', () => {
      host.remove();
      shadowRoot = null;
      if (activePort) activePort.disconnect();
    });
    panel.querySelector('[data-action="copy"]').addEventListener('click', () => {
      navigator.clipboard.writeText(bodyEl.textContent || '');
    });
    panel.querySelector('[data-action="regenerate"]').addEventListener('click', () => {
      if (panel.dataset.mode) runMode(panel.dataset.mode, { force: true });
    });

    shadowRoot.append(style, panel);
    bodyEl = panel.querySelector('.body');
    statusEl = panel.querySelector('.status');
    shadowRoot._panel = panel;
  }

  function setStatus(text, isError) {
    if (!statusEl) return;
    statusEl.textContent = text;
    statusEl.classList.toggle('error', Boolean(isError));
  }

  async function runMode(mode, { force = false } = {}) {
    ensurePanel();
    shadowRoot._panel.dataset.mode = mode;
    bodyEl.textContent = '';

    if (!force) {
      const key = cacheKey(mode);
      const cached = await chrome.storage.local.get(key);
      if (cached[key]) {
        bodyEl.textContent = cached[key].text;
        setStatus(`Cached · ${new Date(cached[key].savedAt).toLocaleTimeString()}`);
        return;
      }
    }

    setStatus('Generating…');
    const text = extractPageText();
    if (!text) {
      setStatus('No readable content found on this page.', true);
      return;
    }

    if (activePort) activePort.disconnect();
    activePort = chrome.runtime.connect({ name: 'page-digest-stream' });

    activePort.onMessage.addListener((message) => {
      if (message.type === 'delta') {
        bodyEl.textContent += message.text;
      } else if (message.type === 'done') {
        setStatus('Done');
        const key = cacheKey(mode);
        chrome.storage.local.set({ [key]: { text: message.fullText, savedAt: Date.now() } });
      } else if (message.type === 'error') {
        setStatus(message.message, true);
      }
    });

    activePort.postMessage({ type: 'run', text, mode });
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.action === 'run') {
      runMode(message.mode);
      sendResponse({ ok: true });
    }
  });
})();
