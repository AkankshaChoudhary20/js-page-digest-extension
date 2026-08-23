const hint = document.getElementById('hint');

document.getElementById('open-options').addEventListener('click', (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

document.querySelectorAll('.mode-btn').forEach((btn) => {
  btn.addEventListener('click', async () => {
    const { apiKey } = await chrome.storage.local.get('apiKey');
    if (!apiKey) {
      hint.textContent = 'Add an API key in options first.';
      return;
    }

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      hint.textContent = 'No active tab.';
      return;
    }

    try {
      await chrome.tabs.sendMessage(tab.id, { action: 'run', mode: btn.dataset.mode });
      window.close();
    } catch {
      hint.textContent = "Can't run on this page.";
    }
  });
});
