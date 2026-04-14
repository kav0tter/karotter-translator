// ==UserScript==
// @name         Karotter Translator
// @namespace    https://karotter.com/
// @version      1.0.0
// @description  karotter.comの投稿をLLMで翻訳するユーザースクリプト
// @author       kav0tter
// @match        https://karotter.com/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @connect      *
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  // ===== CSS =====

  const _style = document.createElement('style');
  _style.textContent = `
    .kt-disabled .kt-translate-btn-row,
    .kt-disabled .kt-compose-translate { display: none !important; }

    .kt-translate-btn-row {
      margin-top: 2px;
      margin-bottom: 2px;
    }

    .kt-translate-btn {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 2px 0;
      border: none;
      background: transparent;
      color: var(--text-muted, #667b93);
      font-size: 12px;
      cursor: pointer;
      transition: color 0.15s;
      line-height: 1;
    }

    .kt-translate-btn:hover:not(:disabled) {
      color: var(--text-secondary, #38516a);
    }

    .kt-translate-btn:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }

    .kt-translate-btn svg {
      flex-shrink: 0;
    }

    .kt-translate-btn.kt-translated {
      color: var(--accent, #1d9bf0);
    }

    .kt-compose-translate {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      margin-right: 6px;
    }

    .kt-lang-select {
      padding: 4px 8px;
      border-radius: 9999px;
      border: 1px solid var(--border-soft, rgba(152, 168, 187, .28));
      background: var(--surface-soft, #eef4fa);
      color: var(--text-primary, #102132);
      font-size: 12px;
      cursor: pointer;
      outline: none;
      transition: border-color 0.15s;
      max-width: 120px;
    }

    .kt-lang-select:focus {
      border-color: var(--accent, #1d9bf0);
    }

    .kt-compose-translate-btn {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 4px 12px;
      border-radius: 9999px;
      border: 1px solid var(--border-soft, rgba(152, 168, 187, .28));
      background: transparent;
      color: var(--text-muted, #667b93);
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      white-space: nowrap;
      transition: background-color 0.15s, border-color 0.15s, color 0.15s;
    }

    .kt-compose-translate-btn.kt-translated {
      color: var(--accent, #1d9bf0);
      border-color: var(--accent-soft, rgba(29, 155, 240, .14));
    }

    .kt-compose-translate-btn:hover:not(:disabled) {
      background: var(--surface-soft, #eef4fa);
      border-color: var(--neutral-300, #c6d5e4);
      color: var(--text-secondary, #38516a);
    }

    .kt-compose-translate-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .kt-toast {
      position: fixed;
      bottom: 24px;
      left: 50%;
      transform: translateX(-50%);
      padding: 10px 20px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 500;
      z-index: 99999;
      pointer-events: none;
      animation: kt-fade-in 0.2s ease;
      box-shadow: var(--surface-shadow, 0 18px 38px rgba(16, 33, 50, .08));
    }

    .kt-toast-info {
      background: var(--surface-card, #1a2736);
      color: var(--text-primary, #e8f0f8);
    }

    .kt-toast-error {
      background: #dc2626;
      color: #fff;
    }

    @keyframes kt-fade-in {
      from { opacity: 0; transform: translateX(-50%) translateY(8px); }
      to   { opacity: 1; transform: translateX(-50%) translateY(0); }
    }

    /* ===== 設定ボタン ===== */
    .kt-settings-btn {
      position: fixed;
      bottom: 24px;
      right: 24px;
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: var(--accent, #1d9bf0);
      color: #fff;
      border: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 99997;
      box-shadow: 0 2px 12px rgba(0,0,0,0.2);
      transition: background 0.15s;
    }

    .kt-settings-btn:hover {
      background: #1a8cd8;
    }

    /* ===== 設定パネル ===== */
    .kt-settings-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.4);
      z-index: 99998;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .kt-settings-panel {
      background: var(--surface-base, #fff);
      color: var(--text-primary, #102132);
      border-radius: 12px;
      padding: 24px;
      width: 360px;
      max-height: 80vh;
      overflow-y: auto;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      box-sizing: border-box;
    }

    .kt-settings-panel h2 {
      margin: 0 0 16px;
      font-size: 16px;
      font-weight: 700;
    }

    .kt-settings-panel .kt-field-label {
      display: block;
      font-size: 12px;
      font-weight: 600;
      margin-bottom: 4px;
      color: var(--text-secondary, #38516a);
    }

    .kt-settings-panel input[type="text"],
    .kt-settings-panel input[type="password"],
    .kt-settings-panel input[type="number"],
    .kt-settings-panel select {
      width: 100%;
      padding: 8px 10px;
      border: 1px solid var(--border-soft, rgba(152, 168, 187, .4));
      border-radius: 6px;
      font-size: 13px;
      margin-bottom: 12px;
      background: var(--surface-soft, #f5f8fa);
      color: var(--text-primary, #102132);
      box-sizing: border-box;
    }

    .kt-settings-panel .kt-toggle-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 10px;
    }

    .kt-settings-panel .kt-toggle-row span {
      font-size: 13px;
    }

    .kt-settings-panel .kt-save-btn {
      width: 100%;
      padding: 10px;
      background: var(--accent, #1d9bf0);
      color: #fff;
      border: none;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      margin-top: 4px;
      transition: background 0.15s;
    }

    .kt-settings-panel .kt-save-btn:hover {
      background: #1a8cd8;
    }

    .kt-settings-panel .kt-close-btn {
      float: right;
      background: none;
      border: none;
      font-size: 20px;
      cursor: pointer;
      color: var(--text-muted, #667b93);
      padding: 0;
      line-height: 1;
    }

    .kt-settings-panel .kt-status {
      font-size: 12px;
      text-align: center;
      min-height: 18px;
      margin-top: 8px;
    }

    .kt-settings-panel .kt-status.success { color: #16a34a; }
    .kt-settings-panel .kt-status.error { color: #dc2626; }

    .kt-settings-panel hr {
      border: none;
      border-top: 1px solid var(--border-soft, rgba(152, 168, 187, .28));
      margin: 12px 0;
    }

    .kt-settings-panel .kt-section-title {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--text-muted, #667b93);
      margin-bottom: 8px;
    }
  `;
  (document.head || document.documentElement).appendChild(_style);

  // ===== 設定ストレージ =====

  function getSetting(key, defaultValue) {
    try {
      const v = GM_getValue(key, defaultValue);
      return v !== undefined ? v : defaultValue;
    } catch {
      try { return JSON.parse(localStorage.getItem('kt_' + key)) ?? defaultValue; } catch { return defaultValue; }
    }
  }

  function setSetting(key, value) {
    try {
      GM_setValue(key, value);
    } catch {
      try { localStorage.setItem('kt_' + key, JSON.stringify(value)); } catch { /* ignore */ }
    }
  }

  // ===== 設定パネル =====

  function escapeAttr(str) {
    return String(str ?? '').replace(/"/g, '&quot;');
  }

  function openSettingsPanel() {
    if (document.querySelector('.kt-settings-overlay')) return;

    const overlay = document.createElement('div');
    overlay.className = 'kt-settings-overlay';

    const LANGUAGES = [
      '日本語', '英語', '中国語（簡体字）', '中国語（繁体字）',
      '韓国語', 'フランス語', 'スペイン語', 'ドイツ語',
      'イタリア語', 'ポルトガル語', 'ロシア語', 'アラビア語',
      'ヒンディー語', 'タイ語', 'ベトナム語', 'インドネシア語',
    ];

    const cur = {
      baseUrl:       getSetting('baseUrl', ''),
      apiKey:        getSetting('apiKey', ''),
      model:         getSetting('model', 'gpt-4o-mini'),
      language:      getSetting('language', '日本語'),
      maxContext:    getSetting('maxContext', 0),
      maxConcurrent: getSetting('maxConcurrent', 3),
      autoTranslate: getSetting('autoTranslate', false),
      enabled:       getSetting('enabled', true),
      debugMode:     getSetting('debugMode', false),
    };

    const langOptions = LANGUAGES.map(l =>
      `<option value="${l}"${l === cur.language ? ' selected' : ''}>${l}</option>`
    ).join('');

    const panel = document.createElement('div');
    panel.className = 'kt-settings-panel';
    panel.innerHTML = `
      <button class="kt-close-btn" title="閉じる">✕</button>
      <h2>Karotter Translator</h2>

      <div class="kt-section-title">API設定</div>
      <label class="kt-field-label">Base URL</label>
      <input type="text" id="kt-baseUrl" value="${escapeAttr(cur.baseUrl)}" placeholder="https://api.openai.com/v1">
      <label class="kt-field-label">API Key</label>
      <input type="password" id="kt-apiKey" value="${escapeAttr(cur.apiKey)}" placeholder="sk-...">
      <label class="kt-field-label">モデル</label>
      <input type="text" id="kt-model" value="${escapeAttr(cur.model)}" placeholder="gpt-4o-mini">

      <hr>
      <div class="kt-section-title">翻訳設定</div>
      <label class="kt-field-label">翻訳先言語</label>
      <select id="kt-language">${langOptions}</select>
      <label class="kt-field-label">スレッドコンテキスト数 (0=なし)</label>
      <input type="number" id="kt-maxContext" value="${cur.maxContext}" min="0" max="10">
      <label class="kt-field-label">自動翻訳の同時実行数</label>
      <input type="number" id="kt-maxConcurrent" value="${cur.maxConcurrent}" min="1" max="10">

      <hr>
      <div class="kt-toggle-row">
        <span>拡張を有効にする</span>
        <input type="checkbox" id="kt-enabled"${cur.enabled ? ' checked' : ''}>
      </div>
      <div class="kt-toggle-row">
        <span>自動翻訳モード</span>
        <input type="checkbox" id="kt-autoTranslate"${cur.autoTranslate ? ' checked' : ''}>
      </div>
      <div class="kt-toggle-row">
        <span>デバッグモード</span>
        <input type="checkbox" id="kt-debugMode"${cur.debugMode ? ' checked' : ''}>
      </div>

      <button class="kt-save-btn">設定を保存</button>
      <div class="kt-status" id="kt-status"></div>
    `;

    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    panel.querySelector('.kt-close-btn').addEventListener('click', () => overlay.remove());

    panel.querySelector('.kt-save-btn').addEventListener('click', () => {
      const newBaseUrl       = panel.querySelector('#kt-baseUrl').value.trim();
      const newApiKey        = panel.querySelector('#kt-apiKey').value.trim();
      const newModel         = panel.querySelector('#kt-model').value.trim() || 'gpt-4o-mini';
      const newLanguage      = panel.querySelector('#kt-language').value;
      const newMaxContext    = parseInt(panel.querySelector('#kt-maxContext').value) || 0;
      const newMaxConcurrent = parseInt(panel.querySelector('#kt-maxConcurrent').value) || 3;
      const newAutoTranslate = panel.querySelector('#kt-autoTranslate').checked;
      const newEnabled       = panel.querySelector('#kt-enabled').checked;
      const newDebugMode     = panel.querySelector('#kt-debugMode').checked;

      const statusEl = panel.querySelector('#kt-status');

      if (!newBaseUrl || !newApiKey) {
        statusEl.textContent = 'Base URL と API Key は必須です';
        statusEl.className = 'kt-status error';
        return;
      }

      setSetting('baseUrl', newBaseUrl);
      setSetting('apiKey', newApiKey);
      setSetting('model', newModel);
      setSetting('language', newLanguage);
      setSetting('maxContext', newMaxContext);
      setSetting('maxConcurrent', newMaxConcurrent);
      setSetting('autoTranslate', newAutoTranslate);
      setSetting('enabled', newEnabled);
      setSetting('debugMode', newDebugMode);

      // ランタイム変数に即時反映
      extensionEnabled = newEnabled;
      autoTranslateEnabled = newAutoTranslate;
      autoTranslateMaxConcurrent = newMaxConcurrent;
      applyExtensionEnabled(newEnabled);

      statusEl.textContent = '設定を保存しました';
      statusEl.className = 'kt-status success';
      setTimeout(() => { statusEl.textContent = ''; statusEl.className = 'kt-status'; }, 2000);
    });
  }

  function injectSettingsButton() {
    const btn = document.createElement('button');
    btn.className = 'kt-settings-btn';
    btn.title = 'Karotter Translator 設定';
    btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`;
    btn.addEventListener('click', openSettingsPanel);
    document.body.appendChild(btn);
  }

  // ===== 翻訳キャッシュ =====

  const translationCache = new Map();
  const CACHE_MAX_SIZE = 100;

  function cacheSet(key, value) {
    translationCache.delete(key);
    translationCache.set(key, value);
    if (translationCache.size > CACHE_MAX_SIZE) {
      translationCache.delete(translationCache.keys().next().value);
    }
  }

  // ===== 拡張機能オン/オフ =====

  let extensionEnabled = getSetting('enabled', true);

  function applyExtensionEnabled(val) {
    document.body.classList.toggle('kt-disabled', !val);
  }

  applyExtensionEnabled(extensionEnabled);

  // ===== 自動翻訳モード =====

  let autoTranslateEnabled = getSetting('autoTranslate', false);
  let autoTranslateMaxConcurrent = getSetting('maxConcurrent', 3);
  let autoTranslateActive = 0;
  const autoTranslatePending = [];

  function drainAutoTranslate() {
    while (
      (autoTranslateMaxConcurrent <= 0 || autoTranslateActive < autoTranslateMaxConcurrent) &&
      autoTranslatePending.length > 0
    ) {
      const btn = autoTranslatePending.shift();
      if (!document.body.contains(btn) || btn.classList.contains('kt-translated')) continue;
      autoTranslateActive++;
      btn.click();
      const poll = setInterval(() => {
        if (!btn.disabled) {
          clearInterval(poll);
          autoTranslateActive--;
          drainAutoTranslate();
        }
      }, 100);
    }
  }

  function enqueueAutoTranslate(btn) {
    btn.dataset.ktAuto = '1';
    autoTranslatePending.push(btn);
    drainAutoTranslate();
  }

  // ===== 投稿コンテナの特定 =====

  function getPostContainer(reactionBtn) {
    return reactionBtn?.parentElement?.parentElement?.parentElement;
  }

  // ===== スレッドコンテキスト取得 =====

  function extractPostData(reactionBtn) {
    const container = getPostContainer(reactionBtn);
    if (!container) return null;
    const textEl = container.querySelector('p.whitespace-pre-wrap');
    const header = textEl ? getPreviousSiblings(textEl, container) : container;
    const displayName = (header || container)
      .querySelector?.('a[href*="/profile/"]')?.textContent?.trim();
    const handle = [...((header || container).querySelectorAll?.('span') || [])]
      .find(s => /^@\w+$/.test(s.textContent.trim()))?.textContent?.trim();
    const text = textEl?.textContent?.trim();
    if (!text) return null;
    return { displayName: displayName || handle || '不明', handle: handle || '', text };
  }

  function getPreviousSiblings(el, parent) {
    const wrapper = document.createElement('div');
    let node = parent.firstChild;
    while (node && node !== el) {
      wrapper.appendChild(node.cloneNode(true));
      node = node.nextSibling;
    }
    return wrapper;
  }

  function extractReplyTarget(form) {
    const el = form?.querySelector('div.rounded-xl.border');
    if (!el) return null;
    const displayName = el.querySelector('span.truncate.font-semibold')?.textContent?.trim();
    const handle = [...el.querySelectorAll('span')]
      .find(s => /^@\w+$/.test(s.textContent.trim()))?.textContent?.trim();
    const text = el.querySelector('p.whitespace-pre-wrap')?.textContent?.trim();
    if (!text) return null;
    return { displayName: displayName || handle || '不明', handle: handle || '', text };
  }

  function extractQuotedPost(container) {
    const quoteEl = [...container.querySelectorAll('[class*="rounded-2xl"]')]
      .find(el => el.className.includes('border') && el.querySelector('p.whitespace-pre-wrap'));
    if (!quoteEl) return null;
    const displayName = quoteEl.querySelector('a[href*="/profile/"]')?.textContent?.trim();
    const handle = [...quoteEl.querySelectorAll('span')]
      .find(s => /^@\w+$/.test(s.textContent.trim()))?.textContent?.trim();
    const text = quoteEl.querySelector('p.whitespace-pre-wrap')?.textContent?.trim();
    if (!text) return null;
    return { displayName: displayName || handle || '不明', handle: handle || '', text, type: 'quote' };
  }

  function getThreadContext(currentReactionBtn, maxContext) {
    const context = [];
    const isDetailPage = /\/[^/]+\/\d+/.test(window.location.pathname);

    if (isDetailPage) {
      const allBtns = [...document.querySelectorAll('[aria-label="リアクションを追加"]')];
      const currentIdx = allBtns.indexOf(currentReactionBtn);
      if (currentIdx > 0) {
        const ancestors = allBtns.slice(0, currentIdx);
        const limited = maxContext > 0 ? ancestors.slice(-maxContext) : ancestors;
        context.push(...limited.map(extractPostData).filter(Boolean));
      }
    } else {
      const container = getPostContainer(currentReactionBtn);
      const replyToEl = [...(container?.querySelectorAll('*') || [])]
        .find(el => el.children.length === 0 && el.textContent.includes('返信先:'));
      if (replyToEl) {
        const handles = [...replyToEl.textContent.matchAll(/@[\w]+/g)].map(m => m[0]);
        if (handles.length > 0) {
          context.push({ displayName: handles.join(', '), handle: handles.join(', '), text: '[earlier message]' });
        }
      }
    }

    const container = getPostContainer(currentReactionBtn);
    const quoted = extractQuotedPost(container);
    if (quoted) context.push(quoted);

    return context;
  }

  // ===== API呼び出し =====

  function gmFetch(url, options) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: options.method || 'GET',
        url,
        headers: options.headers || {},
        data: options.body,
        onload: (res) => {
          resolve({
            ok: res.status >= 200 && res.status < 300,
            status: res.status,
            text: () => Promise.resolve(res.responseText),
            json: () => Promise.resolve(JSON.parse(res.responseText)),
          });
        },
        onerror: (err) => reject(new Error('ネットワークエラー: ' + (err.error || ''))),
      });
    });
  }

  async function handleTranslate({ text, targetLanguage, sourceLanguage, context, authorName, authorHandle, debug }) {
    const baseUrl  = getSetting('baseUrl', '');
    const apiKey   = getSetting('apiKey', '');
    const model    = getSetting('model', 'gpt-4o-mini');
    const language = getSetting('language', '日本語');

    if (!baseUrl || !apiKey) {
      throw new Error('設定が未完了です。右下の歯車ボタンから設定を行ってください。');
    }

    const target = targetLanguage || language || '日本語';

    const systemPrompt = `You are a native-level translator for social media posts. Your goal is not word-for-word accuracy but natural equivalence — the translated text should feel like it was originally written by a native speaker of the target language in the same mood, register, and personality as the original.

Key principles:
- Prioritize feel over literalness. Ask yourself: "How would a native speaker express this exact feeling in this exact situation?"
- Match the energy: casual stays casual, sarcastic stays sarcastic, excited stays excited
- Slang and internet expressions should be replaced with their natural equivalents in the target language, not translated literally (e.g. "lol" → "w" or "笑" in Japanese, not "声を出して笑った")
- Preserve speech rhythm, trailing punctuation, and emotional cues (ellipses, repeated characters, all-caps emphasis, etc.)
- If the source and target language are the same, set is_same_language to true

Respond ONLY with a JSON object. No markdown, no explanation.
{"source_language":"<name>","target_language":"<name>","translated_text":"<translation>","is_same_language":<bool>}`;

    const contextBlock = (context && context.length > 0)
      ? `\nContext (for pronoun/reference resolution only — do not translate these):\n`
        + context.map(m => {
            const label = m.type === 'quote' ? '[Quoted post]' : '[Reply thread]';
            return `${label} ${m.displayName}${m.handle ? ` (${m.handle})` : ''}: "${m.text}"`;
          }).join('\n')
        + '\n'
      : '';

    const authorLine = authorName
      ? `Post author: ${authorName}${authorHandle ? ` (${authorHandle})` : ''}\n`
      : '';

    const userPrompt = `Target language: ${target}
${sourceLanguage ? `Source language: ${sourceLanguage}\n` : ''}${contextBlock}${authorLine}
Post to translate:
${text}`;

    const endpoint = baseUrl.replace(/\/$/, '') + '/chat/completions';

    const compatKey = `compat__${model}__${baseUrl}`;
    const needsFallback = getSetting(compatKey, false);

    const buildBody = (fallback) => fallback
      ? {
          model: model || 'gpt-4o-mini',
          messages: [{ role: 'user', content: `${systemPrompt}\n\n${userPrompt}` }],
          temperature: 0.3,
        }
      : {
          model: model || 'gpt-4o-mini',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.3,
          max_tokens: 300,
        };

    if (debug) {
      console.log('[KT] APIリクエスト ─────────────────');
      console.log('[KT] endpoint:', endpoint);
      console.log('[KT] user prompt:\n', userPrompt);
      console.log('[KT] model:', model, needsFallback ? '(fallbackモード)' : '');
    }

    const fetchOptions = (body) => ({
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
    });

    let response = await gmFetch(endpoint, fetchOptions(buildBody(needsFallback)));

    if (response.status === 400 && !needsFallback) {
      const errorText = await response.text();
      if (debug) console.log('[KT] 400エラー、フォールバックリトライ:', errorText);

      response = await gmFetch(endpoint, fetchOptions(buildBody(true)));

      if (!response.ok) {
        const fallbackError = await response.text();
        throw new Error(`API エラー (${response.status}): ${fallbackError}`);
      }

      setSetting(compatKey, true);
      if (debug) console.log('[KT] フォールバックモードを記憶:', compatKey);
    } else if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API エラー (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) throw new Error('APIから空のレスポンスが返されました');

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      throw new Error('APIレスポンスのJSONパースに失敗しました');
    }

    if (typeof parsed.translated_text !== 'string') {
      throw new Error('APIレスポンスの形式が不正です');
    }

    if (debug) {
      console.log('[KT] APIレスポンス ─────────────────');
      console.log('[KT]', parsed);
    }

    return parsed;
  }

  // ===== 投稿一覧の翻訳ボタン =====

  const PROCESSED_ATTR = 'data-kt-translated';

  function injectTranslateButton(reactionBtn) {
    if (!extensionEnabled) return;
    const container = getPostContainer(reactionBtn);
    if (!container || container.hasAttribute(PROCESSED_ATTR)) return;
    container.setAttribute(PROCESSED_ATTR, '1');

    const textEl = container.querySelector('p.whitespace-pre-wrap');
    if (!textEl) return;

    const btnRow = document.createElement('div');
    btnRow.className = 'kt-translate-btn-row';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'kt-translate-btn';
    btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 8 6 6"/><path d="m4 14 6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/><path d="m22 22-5-10-5 10"/><path d="M14 18h6"/></svg><span class="kt-btn-label">翻訳</span>`;

    btnRow.appendChild(btn);
    textEl.insertAdjacentElement('beforebegin', btnRow);

    if (autoTranslateEnabled) enqueueAutoTranslate(btn);

    let originalText = null;
    let isTranslated = false;

    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      e.preventDefault();

      if (isTranslated) {
        textEl.innerHTML = originalText;
        isTranslated = false;
        btn.querySelector('.kt-btn-label').textContent = '翻訳';
        btn.classList.remove('kt-translated');
        return;
      }

      const currentText = textEl.textContent.trim();
      if (!currentText) return;

      btn.disabled = true;
      btn.querySelector('.kt-btn-label').textContent = '翻訳中...';

      try {
        let result = translationCache.get(currentText);
        if (!result) {
          const maxContext = getSetting('maxContext', 0);
          const debugMode  = getSetting('debugMode', false);
          const context = getThreadContext(reactionBtn, maxContext);
          const authorData = extractPostData(reactionBtn);

          if (debugMode) {
            console.log('[KT] 翻訳リクエスト ─────────────────');
            console.log('[KT] 投稿テキスト:', currentText);
            console.log('[KT] 投稿者:', authorData);
            console.log('[KT] コンテキスト:', context.length + '件', context);
          }

          if (debugMode && context.length > 0) {
            btn.querySelector('.kt-btn-label').textContent = `翻訳中... [ctx:${context.length}]`;
          }

          result = await handleTranslate({
            text: currentText,
            context,
            authorName: authorData?.displayName,
            authorHandle: authorData?.handle,
            debug: debugMode,
          });
          cacheSet(currentText, result);

          if (debugMode) {
            console.log('[KT] 翻訳レスポンス ─────────────────');
            console.log('[KT]', result);
          }
        } else if (getSetting('debugMode', false)) {
          console.log('[KT] キャッシュヒット:', currentText.substring(0, 30) + '...');
        }

        const { translated_text, is_same_language, source_language, target_language } = result;

        if (is_same_language) {
          if (!btn.dataset.ktAuto) showToast('同じ言語のため翻訳をスキップしました');
          btn.querySelector('.kt-btn-label').textContent = '翻訳';
          btn.disabled = false;
          return;
        }

        originalText = textEl.innerHTML;
        textEl.innerHTML = escapeHtml(translated_text);
        isTranslated = true;

        btn.querySelector('.kt-btn-label').textContent = `${source_language} → ${target_language} · 元に戻す`;
        btn.classList.add('kt-translated');
      } catch (err) {
        showToast(`翻訳エラー: ${err.message}`, 'error');
        btn.querySelector('.kt-btn-label').textContent = '翻訳';
      } finally {
        btn.disabled = false;
      }
    });
  }

  // ===== 最近使用した翻訳先言語 =====

  const MAX_RECENT_LANGS = 3;

  function getRecentLanguages() {
    return getSetting('recentLanguages', []);
  }

  function saveRecentLanguage(lang) {
    const recent = getRecentLanguages();
    const updated = [lang, ...recent.filter(l => l !== lang)].slice(0, MAX_RECENT_LANGS);
    setSetting('recentLanguages', updated);
  }

  function buildLangOptions(langSelect, allLanguages, recentLanguages, selectedLang) {
    langSelect.innerHTML = '';

    if (recentLanguages.length > 0) {
      recentLanguages.forEach(lang => {
        const opt = document.createElement('option');
        opt.value = lang;
        opt.textContent = lang;
        langSelect.appendChild(opt);
      });
      const sep = document.createElement('option');
      sep.disabled = true;
      sep.textContent = '──────────';
      langSelect.appendChild(sep);
    }

    allLanguages.forEach(lang => {
      const opt = document.createElement('option');
      opt.value = lang;
      opt.textContent = lang;
      langSelect.appendChild(opt);
    });

    langSelect.value = selectedLang;
  }

  // ===== 投稿・返信画面の翻訳ボタン =====

  const COMPOSE_SUBMIT_LABELS = ['カロート', '返信', '引用カロート'];

  function injectComposeTranslateButton(root) {
    if (!extensionEnabled) return;
    const form = root.matches('form') ? root : root.querySelector('form');
    if (!form || form.hasAttribute(PROCESSED_ATTR)) return;

    const textarea = form.querySelector('textarea');
    if (!textarea) return;

    const submitBtn = [...form.querySelectorAll('button[type="submit"]')]
      .find(b => COMPOSE_SUBMIT_LABELS.includes(b.textContent.trim()));
    if (!submitBtn) return;

    form.setAttribute(PROCESSED_ATTR, '1');

    const LANGUAGES = [
      '英語', '日本語', '中国語（簡体字）', '中国語（繁体字）',
      '韓国語', 'フランス語', 'スペイン語', 'ドイツ語',
      'イタリア語', 'ポルトガル語', 'ロシア語', 'アラビア語',
      'ヒンディー語', 'タイ語', 'ベトナム語', 'インドネシア語',
    ];

    const container = document.createElement('div');
    container.className = 'kt-compose-translate';

    const langSelect = document.createElement('select');
    langSelect.className = 'kt-lang-select';
    langSelect.title = '翻訳先言語';

    const recent = getRecentLanguages();
    const language = getSetting('language', '日本語');
    const fallback = language === '英語' ? '日本語' : '英語';
    const selectedLang = recent[0] ?? (LANGUAGES.includes(fallback) ? fallback : LANGUAGES[0]);
    buildLangOptions(langSelect, LANGUAGES, recent, selectedLang);

    const translateBtn = document.createElement('button');
    translateBtn.type = 'button';
    translateBtn.className = 'kt-compose-translate-btn';
    const btnInner = () => `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 8 6 6"/><path d="m4 14 6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/><path d="m22 22-5-10-5 10"/><path d="M14 18h6"/></svg> 翻訳して置換`;
    translateBtn.innerHTML = btnInner();

    let originalText = null;
    let isTranslated = false;

    translateBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      e.preventDefault();

      if (isTranslated) {
        setNativeValue(textarea, originalText);
        originalText = null;
        isTranslated = false;
        translateBtn.innerHTML = btnInner();
        translateBtn.classList.remove('kt-translated');
        return;
      }

      const text = textarea.value.trim();
      if (!text) return;

      translateBtn.disabled = true;
      translateBtn.textContent = '翻訳中...';

      try {
        const maxContext = getSetting('maxContext', 0);
        const debugMode  = getSetting('debugMode', false);

        const isModal = !!form.closest('.fixed.inset-0');
        const modal = form.closest('.fixed.inset-0') ?? form.parentElement;
        const context = [];

        if (isModal) {
          const replyTarget = extractReplyTarget(form);
          if (replyTarget) context.push(replyTarget);
          const quoted = extractQuotedPost(modal);
          if (quoted) context.push(quoted);
        } else {
          const allReactionBtns = [...document.querySelectorAll('[aria-label="リアクションを追加"]')];
          const postsBeforeForm = allReactionBtns.filter(btn =>
            btn.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING
          );
          const limited = maxContext > 0 ? postsBeforeForm.slice(-maxContext) : postsBeforeForm;
          context.push(...limited.map(extractPostData).filter(Boolean));
        }

        if (debugMode && context.length > 0) {
          console.log('[KT] 返信コンテキスト:', context.length + '件', context);
          translateBtn.textContent = `翻訳中... [ctx:${context.length}]`;
        }

        const cacheKey = `${text}::${langSelect.value}`;
        let result = translationCache.get(cacheKey);
        if (!result) {
          result = await handleTranslate({ text, targetLanguage: langSelect.value, context, debug: debugMode });
          if (!result.is_same_language) cacheSet(cacheKey, result);
        }

        const { translated_text, is_same_language } = result;

        if (is_same_language) {
          showToast('同じ言語のため翻訳をスキップしました');
          return;
        }

        originalText = text;
        isTranslated = true;
        setNativeValue(textarea, translated_text);
        translateBtn.textContent = '元に戻す';
        translateBtn.classList.add('kt-translated');

        const usedLang = langSelect.value;
        saveRecentLanguage(usedLang);
        buildLangOptions(langSelect, LANGUAGES, getRecentLanguages(), usedLang);
      } catch (err) {
        showToast(`翻訳エラー: ${err.message}`, 'error');
        translateBtn.innerHTML = btnInner();
      } finally {
        translateBtn.disabled = false;
      }
    });

    container.appendChild(langSelect);
    container.appendChild(translateBtn);

    const toolbar = submitBtn.parentElement;
    const charCount = [...toolbar.children].find(
      el => el !== submitBtn && el.textContent.trim().match(/^\d+$/)
    );
    toolbar.insertBefore(container, charCount ?? submitBtn);
  }

  function tryInjectCompose(el) {
    const modal = el.matches?.('.fixed.inset-0') ? el : el.querySelector?.('.fixed.inset-0');
    if (modal) {
      setTimeout(() => injectComposeTranslateButton(modal), 200);
      return;
    }
    const forms = el.matches?.('form') ? [el] : [...(el.querySelectorAll?.('form') ?? [])];
    forms.forEach(f => setTimeout(() => injectComposeTranslateButton(f), 100));
  }

  // ===== React管理のtextarea更新 =====

  function setNativeValue(element, value) {
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      'value'
    ).set;
    nativeInputValueSetter.call(element, value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // ===== ユーティリティ =====

  function escapeHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;')
      .replace(/\n/g, '<br>');
  }

  function showToast(message, type = 'info') {
    const existing = document.querySelector('.kt-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = `kt-toast kt-toast-${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => toast.remove(), 3000);
  }

  // ===== 投稿・モーダルの検出 =====

  function processElement(el) {
    if (el.nodeType !== Node.ELEMENT_NODE) return;

    el.querySelectorAll('[aria-label="リアクションを追加"]').forEach(injectTranslateButton);
    if (el.matches('[aria-label="リアクションを追加"]')) injectTranslateButton(el);

    tryInjectCompose(el);
  }

  const observer = new MutationObserver(mutations => {
    for (const mutation of mutations) {
      mutation.addedNodes.forEach(processElement);
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });

  document.querySelectorAll('[aria-label="リアクションを追加"]').forEach(injectTranslateButton);
  document.querySelectorAll('form').forEach(f => injectComposeTranslateButton(f));

  injectSettingsButton();

})();
