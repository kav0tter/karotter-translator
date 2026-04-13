// popup.js - 設定の読み込み・保存

// ヘッダーを5回クリックでデバッグモード欄を表示
let headerClickCount = 0;
document.getElementById('appHeader').addEventListener('click', () => {
  headerClickCount++;
  if (headerClickCount >= 5) {
    document.getElementById('debugRow').classList.add('visible');
    document.getElementById('debugDivider').style.display = '';
  }
});

const KEYS = ['baseUrl', 'apiKey', 'model', 'language', 'maxContext', 'debugMode'];

// 設定を読み込んでフォームに反映
chrome.storage.sync.get(KEYS, (data) => {
  document.getElementById('baseUrl').value    = data.baseUrl    || '';
  document.getElementById('apiKey').value     = data.apiKey     || '';
  document.getElementById('model').value      = data.model      || 'gpt-4o-mini';
  document.getElementById('language').value   = data.language   || '日本語';
  document.getElementById('maxContext').value    = data.maxContext ?? 0;
  document.getElementById('debugMode').checked  = data.debugMode  ?? false;
});

// 保存
document.getElementById('saveBtn').addEventListener('click', () => {
  const baseUrl    = document.getElementById('baseUrl').value.trim();
  const apiKey     = document.getElementById('apiKey').value.trim();
  const model      = document.getElementById('model').value.trim() || 'gpt-4o-mini';
  const language   = document.getElementById('language').value;
  const maxContext = parseInt(document.getElementById('maxContext').value) || 0;
  const debugMode  = document.getElementById('debugMode').checked;

  const statusEl = document.getElementById('status');

  if (!baseUrl || !apiKey) {
    statusEl.textContent = 'Base URL と API Key は必須です';
    statusEl.className = 'status error';
    return;
  }

  chrome.storage.sync.set({ baseUrl, apiKey, model, language, maxContext, debugMode }, () => {
    statusEl.textContent = '設定を保存しました';
    statusEl.className = 'status success';
    setTimeout(() => { statusEl.className = 'status'; }, 2000);
  });
});
