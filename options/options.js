const apiKeyInput = document.getElementById('api-key');
const modelSelect = document.getElementById('model');
const status = document.getElementById('status');

async function load() {
  const { apiKey, model } = await chrome.storage.local.get(['apiKey', 'model']);
  if (apiKey) apiKeyInput.value = apiKey;
  if (model) modelSelect.value = model;
}

document.getElementById('save').addEventListener('click', async () => {
  await chrome.storage.local.set({
    apiKey: apiKeyInput.value.trim(),
    model: modelSelect.value,
  });
  status.textContent = 'Saved.';
  setTimeout(() => (status.textContent = ''), 2000);
});

load();
