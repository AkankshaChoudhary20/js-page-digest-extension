const apiKeyInput = document.getElementById('api-key');
const modelSelect = document.getElementById('model');
const saveButton = document.getElementById('save');
const status = document.getElementById('status');
let statusTimeout;

async function load() {
  const { apiKey, model } = await chrome.storage.local.get(['apiKey', 'model']);
  if (apiKey) apiKeyInput.value = apiKey;
  if (model) modelSelect.value = model;
}

saveButton.addEventListener('click', async () => {
  clearTimeout(statusTimeout);
  saveButton.disabled = true;
  status.textContent = 'Saving…';
  try {
    await chrome.storage.local.set({
      apiKey: apiKeyInput.value.trim(),
      model: modelSelect.value,
    });
    status.textContent = 'Saved.';
    statusTimeout = setTimeout(() => (status.textContent = ''), 2000);
  } catch {
    status.textContent = 'Could not save settings. Please try again.';
  } finally {
    saveButton.disabled = false;
  }
});

load().catch(() => {
  status.textContent = 'Could not load settings. Please reopen this page.';
});
