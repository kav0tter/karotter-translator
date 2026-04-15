// popup.js - 設定の読み込み・保存

// ========== i18n ==========

const _messages = {
  ja: {
    popupTitle:              'Karotter Translator 設定',
    uiLanguageLabel:         '表示言語',
    uiLanguageAuto:          'システム言語',
    uiLanguageHint:          '拡張機能UIの表示言語',
    enableTranslation:       '翻訳機能を有効にする',
    preset:                  'プリセット',
    presetSelectPlaceholder: '— 選択して切り替え —',
    presetNamePlaceholder:   'プリセット名を入力して保存',
    save:                    '保存',
    delete:                  '削除',
    baseUrlHint:             'OpenAI互換APIのエンドポイント',
    modelLabel:              'モデル',
    modelHint:               '使用するモデルID（例: gpt-4o, gemma-3-27b-it）',
    defaultTargetLang:       '翻訳先デフォルト言語',
    defaultTargetLangHint:   '投稿一覧の「翻訳」ボタンで使う言語',
    threadContextCount:      'スレッドコンテキスト取得数',
    threadContextHint:       '返信翻訳時に遡る投稿数（0 = 無制限）',
    maxConcurrentLabel:      '自動翻訳の同時実行数',
    maxConcurrentHint:       '一度に並列翻訳する最大数（0 以下 = 無制限）',
    autoTranslateMode:       '自動翻訳モード',
    autoTranslateWarning:    '投稿が表示されるたびに自動で翻訳します。表示中の全投稿がAPIを呼び出すため、コストが大幅に増加する場合があります。',
    debugMode:               'デバッグモード',
    usageStats:              '使用状況',
    reset:                   'リセット',
    requests:                'リクエスト数',
    inputTokens:             '入力トークン',
    outputTokens:            '出力トークン',
    saveSettings:            '設定を保存',
    alertPresetName:         'プリセット名を入力してください',
    alertBaseUrlApiKey:      'Base URL と API Key を入力してください',
    confirmDeletePreset:     '「$1」を削除しますか？',
    confirmResetStats:       '使用状況をリセットしますか？',
    errorBaseUrlApiKey:      'Base URL と API Key は必須です',
    successSaveSettings:     '設定を保存しました',
    lang_ja: '日本語',       lang_en: '英語',
    lang_zh_CN: '中国語（簡体字）', lang_zh_TW: '中国語（繁体字）',
    lang_ko: '韓国語',       lang_fr: 'フランス語',
    lang_es: 'スペイン語',   lang_de: 'ドイツ語',
    lang_it: 'イタリア語',   lang_pt: 'ポルトガル語',
    lang_ru: 'ロシア語',     lang_ar: 'アラビア語',
    lang_hi: 'ヒンディー語', lang_th: 'タイ語',
    lang_vi: 'ベトナム語',   lang_id: 'インドネシア語',
  },
  en: {
    popupTitle:              'Karotter Translator Settings',
    uiLanguageLabel:         'Display language',
    uiLanguageAuto:          'System language',
    uiLanguageHint:          'Language for extension UI',
    enableTranslation:       'Enable Translation',
    preset:                  'Preset',
    presetSelectPlaceholder: '— Select to switch —',
    presetNamePlaceholder:   'Enter preset name to save',
    save:                    'Save',
    delete:                  'Delete',
    baseUrlHint:             'OpenAI-compatible API endpoint',
    modelLabel:              'Model',
    modelHint:               'Model ID to use (e.g. gpt-4o, gemma-3-27b-it)',
    defaultTargetLang:       'Default target language',
    defaultTargetLangHint:   'Language used by the "Translate" button in post list',
    threadContextCount:      'Thread context count',
    threadContextHint:       'Posts to look back when translating replies (0 = unlimited)',
    maxConcurrentLabel:      'Auto-translate concurrency',
    maxConcurrentHint:       'Max parallel translations at once (0 or less = unlimited)',
    autoTranslateMode:       'Auto-translate mode',
    autoTranslateWarning:    'Automatically translates every post as it appears. All visible posts call the API, which may significantly increase costs.',
    debugMode:               'Debug mode',
    usageStats:              'Usage',
    reset:                   'Reset',
    requests:                'Requests',
    inputTokens:             'Input tokens',
    outputTokens:            'Output tokens',
    saveSettings:            'Save settings',
    alertPresetName:         'Please enter a preset name',
    alertBaseUrlApiKey:      'Please enter Base URL and API Key',
    confirmDeletePreset:     'Delete "$1"?',
    confirmResetStats:       'Reset usage statistics?',
    errorBaseUrlApiKey:      'Base URL and API Key are required',
    successSaveSettings:     'Settings saved',
    lang_ja: 'Japanese',    lang_en: 'English',
    lang_zh_CN: 'Chinese (Simplified)', lang_zh_TW: 'Chinese (Traditional)',
    lang_ko: 'Korean',       lang_fr: 'French',
    lang_es: 'Spanish',      lang_de: 'German',
    lang_it: 'Italian',      lang_pt: 'Portuguese',
    lang_ru: 'Russian',      lang_ar: 'Arabic',
    lang_hi: 'Hindi',        lang_th: 'Thai',
    lang_vi: 'Vietnamese',   lang_id: 'Indonesian',
  },
};

function _getLocale(uiLanguage) {
  if (uiLanguage === 'ja' || uiLanguage === 'en') return uiLanguage;
  return (chrome.i18n.getUILanguage() || navigator.language || 'ja').startsWith('ja') ? 'ja' : 'en';
}

let _locale = _getLocale('auto');

function _t(key, sub) {
  let msg = _messages[_locale]?.[key] ?? _messages.ja[key] ?? key;
  if (sub !== undefined) msg = msg.replace('$1', sub);
  return msg;
}

function applyI18n() {
  document.title = _t('popupTitle');
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const msg = _t(el.dataset.i18n);
    if (msg) el.textContent = msg;
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const msg = _t(el.dataset.i18nPlaceholder);
    if (msg) el.placeholder = msg;
  });
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    const msg = _t(el.dataset.i18nTitle);
    if (msg) el.title = msg;
  });
  // 言語オプションの表示名も更新
  document.querySelectorAll('#language option[data-i18n]').forEach(el => {
    const msg = _t(el.dataset.i18n);
    if (msg) el.textContent = msg;
  });
}

// ========== 初期化（uiLanguage を先読みして i18n 適用） ==========

const KEYS = ['enabled', 'baseUrl', 'apiKey', 'model', 'language', 'maxContext', 'maxConcurrent', 'autoTranslate', 'debugMode', 'uiLanguage'];

chrome.storage.sync.get(KEYS, (data) => {
  _locale = _getLocale(data.uiLanguage || 'auto');
  applyI18n();

  document.getElementById('uiLanguage').value       = data.uiLanguage      || 'auto';
  document.getElementById('enabled').checked        = data.enabled         ?? true;
  document.getElementById('baseUrl').value          = data.baseUrl         || '';
  document.getElementById('apiKey').value           = data.apiKey          || '';
  document.getElementById('model').value            = data.model           || 'gpt-4o-mini';
  document.getElementById('language').value         = data.language        || '日本語';
  document.getElementById('maxContext').value       = data.maxContext      ?? 0;
  document.getElementById('maxConcurrent').value    = data.maxConcurrent   ?? 3;
  const autoTranslateEl = document.getElementById('autoTranslate');
  autoTranslateEl.checked = data.autoTranslate ?? false;
  updateAutoTranslateWarning(autoTranslateEl.checked);
  document.getElementById('debugMode').checked      = data.debugMode       ?? false;
});

// ========== 表示言語の即時切り替え ==========

document.getElementById('uiLanguage').addEventListener('change', (e) => {
  const uiLanguage = e.target.value;
  chrome.storage.sync.set({ uiLanguage });
  _locale = _getLocale(uiLanguage);
  applyI18n();
  loadPresets(); // プレースホルダー文字列を再描画
});

// ========== ヘッダー5クリックでデバッグ行表示 ==========

let headerClickCount = 0;
document.getElementById('appHeader').addEventListener('click', () => {
  headerClickCount++;
  if (headerClickCount >= 5) {
    document.getElementById('debugRow').classList.add('visible');
    document.getElementById('debugDivider').style.display = '';
  }
});

// ========== 即時反映トグル ==========

function saveSingleKey(key, value) {
  chrome.storage.sync.set({ [key]: value });
}

document.getElementById('enabled').addEventListener('change', (e) => {
  saveSingleKey('enabled', e.target.checked);
});

function updateAutoTranslateWarning(checked) {
  document.getElementById('autoTranslateWarning').classList.toggle('visible', checked);
}

document.getElementById('autoTranslate').addEventListener('change', (e) => {
  updateAutoTranslateWarning(e.target.checked);
});

// ========== プリセット ==========

function loadPresets() {
  chrome.storage.sync.get(['configPresets', 'activePresetId'], ({ configPresets = [], activePresetId = '' }) => {
    const sel = document.getElementById('presetSelect');
    sel.innerHTML = `<option value="">${_t('presetSelectPlaceholder')}</option>`;
    configPresets.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.name;
      sel.appendChild(opt);
    });
    sel.value = activePresetId;
    document.getElementById('presetDeleteBtn').disabled = !sel.value;
  });
}

loadPresets();

document.getElementById('presetSelect').addEventListener('change', (e) => {
  const id = e.target.value;
  document.getElementById('presetDeleteBtn').disabled = !id;
  if (!id) return;

  chrome.storage.sync.get('configPresets', ({ configPresets = [] }) => {
    const preset = configPresets.find(p => p.id === id);
    if (!preset) return;
    document.getElementById('baseUrl').value = preset.baseUrl;
    document.getElementById('apiKey').value  = preset.apiKey;
    document.getElementById('model').value   = preset.model;
    chrome.storage.sync.set({ baseUrl: preset.baseUrl, apiKey: preset.apiKey, model: preset.model, activePresetId: id });
  });
});

document.getElementById('presetSaveBtn').addEventListener('click', () => {
  const name    = document.getElementById('presetName').value.trim();
  const baseUrl = document.getElementById('baseUrl').value.trim();
  const apiKey  = document.getElementById('apiKey').value.trim();
  const model   = document.getElementById('model').value.trim() || 'gpt-4o-mini';

  if (!name)               { alert(_t('alertPresetName')); return; }
  if (!baseUrl || !apiKey) { alert(_t('alertBaseUrlApiKey')); return; }

  chrome.storage.sync.get('configPresets', ({ configPresets = [] }) => {
    const id = Date.now().toString();
    const updated = [...configPresets, { id, name, baseUrl, apiKey, model }];
    chrome.storage.sync.set({ configPresets: updated }, () => {
      document.getElementById('presetName').value = '';
      loadPresets();
      document.getElementById('presetSelect').value = id;
      document.getElementById('presetDeleteBtn').disabled = false;
    });
  });
});

document.getElementById('presetDeleteBtn').addEventListener('click', () => {
  const id   = document.getElementById('presetSelect').value;
  const name = document.getElementById('presetSelect').selectedOptions[0]?.textContent;
  if (!id) return;
  if (!confirm(_t('confirmDeletePreset', name))) return;

  chrome.storage.sync.get(['configPresets', 'activePresetId'], ({ configPresets = [], activePresetId }) => {
    const updated = configPresets.filter(p => p.id !== id);
    const clear = activePresetId === id ? { activePresetId: '' } : {};
    chrome.storage.sync.set({ configPresets: updated, ...clear }, loadPresets);
  });
});

// ========== 使用状況 ==========

function formatNumber(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}

function loadStats() {
  chrome.storage.local.get('stats', ({ stats = {} }) => {
    document.getElementById('statsRequests').textContent   = formatNumber(stats.requests         || 0);
    document.getElementById('statsPrompt').textContent     = formatNumber(stats.promptTokens     || 0);
    document.getElementById('statsCompletion').textContent = formatNumber(stats.completionTokens || 0);
  });
}

loadStats();

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.stats) loadStats();
});

document.getElementById('statsResetBtn').addEventListener('click', () => {
  if (!confirm(_t('confirmResetStats'))) return;
  chrome.storage.local.set({ stats: { requests: 0, promptTokens: 0, completionTokens: 0 } }, loadStats);
});

// ========== 保存ボタン ==========

document.getElementById('saveBtn').addEventListener('click', () => {
  const baseUrl       = document.getElementById('baseUrl').value.trim();
  const apiKey        = document.getElementById('apiKey').value.trim();
  const model         = document.getElementById('model').value.trim() || 'gpt-4o-mini';
  const language      = document.getElementById('language').value;
  const maxContext    = parseInt(document.getElementById('maxContext').value) || 0;
  const maxConcurrent = parseInt(document.getElementById('maxConcurrent').value) || 3;

  const statusEl = document.getElementById('status');

  if (!baseUrl || !apiKey) {
    statusEl.textContent = _t('errorBaseUrlApiKey');
    statusEl.className = 'status error';
    return;
  }

  const autoTranslate = document.getElementById('autoTranslate').checked;
  const debugMode     = document.getElementById('debugMode').checked;

  chrome.storage.sync.set({ baseUrl, apiKey, model, language, maxContext, maxConcurrent, autoTranslate, debugMode }, () => {
    statusEl.textContent = _t('successSaveSettings');
    statusEl.className = 'status success';
    setTimeout(() => { statusEl.className = 'status'; }, 2000);
  });
});
