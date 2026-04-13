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

const KEYS = ['baseUrl', 'apiKey', 'model', 'language', 'maxContext', 'autoTranslate', 'debugMode'];

// 設定を読み込んでフォームに反映
chrome.storage.sync.get(KEYS, (data) => {
  document.getElementById('baseUrl').value    = data.baseUrl    || '';
  document.getElementById('apiKey').value     = data.apiKey     || '';
  document.getElementById('model').value      = data.model      || 'gpt-4o-mini';
  document.getElementById('language').value   = data.language   || '日本語';
  document.getElementById('maxContext').value      = data.maxContext    ?? 0;
  const autoTranslateEl = document.getElementById('autoTranslate');
  autoTranslateEl.checked = data.autoTranslate ?? false;
  updateAutoTranslateWarning(autoTranslateEl.checked);
  document.getElementById('debugMode').checked     = data.debugMode     ?? false;
});

function updateAutoTranslateWarning(checked) {
  document.getElementById('autoTranslateWarning').classList.toggle('visible', checked);
}

document.getElementById('autoTranslate').addEventListener('change', (e) => {
  updateAutoTranslateWarning(e.target.checked);
});

// ========== 使用状況 ==========

function formatNumber(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}

function loadStats() {
  chrome.storage.local.get('stats', ({ stats = {} }) => {
    document.getElementById('statsRequests').textContent  = formatNumber(stats.requests         || 0);
    document.getElementById('statsPrompt').textContent    = formatNumber(stats.promptTokens     || 0);
    document.getElementById('statsCompletion').textContent = formatNumber(stats.completionTokens || 0);
  });
}

loadStats();

document.getElementById('statsResetBtn').addEventListener('click', () => {
  if (!confirm('使用状況をリセットしますか？')) return;
  chrome.storage.local.set({ stats: { requests: 0, promptTokens: 0, completionTokens: 0 } }, loadStats);
});

// 保存
document.getElementById('saveBtn').addEventListener('click', () => {
  const baseUrl    = document.getElementById('baseUrl').value.trim();
  const apiKey     = document.getElementById('apiKey').value.trim();
  const model      = document.getElementById('model').value.trim() || 'gpt-4o-mini';
  const language   = document.getElementById('language').value;
  const maxContext    = parseInt(document.getElementById('maxContext').value) || 0;
  const autoTranslate = document.getElementById('autoTranslate').checked;
  const debugMode     = document.getElementById('debugMode').checked;

  const statusEl = document.getElementById('status');

  if (!baseUrl || !apiKey) {
    statusEl.textContent = 'Base URL と API Key は必須です';
    statusEl.className = 'status error';
    return;
  }

  chrome.storage.sync.set({ baseUrl, apiKey, model, language, maxContext, autoTranslate, debugMode }, () => {
    statusEl.textContent = '設定を保存しました';
    statusEl.className = 'status success';
    setTimeout(() => { statusEl.className = 'status'; }, 2000);
  });
});
