// ==UserScript==
// @name         Karotter Translator
// @namespace    https://karotter.com/
// @version      1.2.0
// @description  karotter.comの投稿をLLMで翻訳するユーザースクリプト
// @author       kav0tter
// @match        https://karotter.com/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @connect      *
// @run-at       document-idle
// @updateURL    https://raw.githubusercontent.com/kav0tter/karotter-translator/master/karotter-translator.user.js
// @downloadURL  https://raw.githubusercontent.com/kav0tter/karotter-translator/master/karotter-translator.user.js
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
    // GM_xmlhttpRequest が使える場合はCORS制限なしで呼ぶ
    if (typeof GM_xmlhttpRequest === 'function') {
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
    // フォールバック: 通常の fetch（CORSが許可されているAPIのみ動作）
    return fetch(url, options);
  }

  async function handleTranslate({ text, targetLanguage, sourceLanguage, context, authorName, authorHandle, debug }) {
    const baseUrl  = getSetting('baseUrl', '');
    const apiKey   = getSetting('apiKey', '');
    const model    = getSetting('model', 'gpt-4o-mini');
    const language = getSetting('language', '日本語');

    if (!baseUrl || !apiKey) {
      throw new Error('設定が未完了です。karotter.com/settings の「Karotter Translator」から設定を行ってください。');
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

    // 使用状況を記録
    try {
      const usage = data.usage;
      if (usage) {
        const s = getSetting('stats', {});
        setSetting('stats', {
          requests:         (s.requests         || 0) + 1,
          promptTokens:     (s.promptTokens     || 0) + (usage.prompt_tokens     || 0),
          completionTokens: (s.completionTokens || 0) + (usage.completion_tokens || 0),
        });
      }
    } catch { /* ignore */ }

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

    if (window.location.pathname.startsWith('/settings')) injectKtSettings();
  }

  const observer = new MutationObserver(mutations => {
    for (const mutation of mutations) {
      mutation.addedNodes.forEach(processElement);
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });

  // SPA ナビゲーション検知（history.pushState をインターセプト）
  const _origPushState = history.pushState.bind(history);
  history.pushState = function (...args) {
    _origPushState(...args);
    if (!window.location.pathname.startsWith('/settings')) _ktHidePanel();
    setTimeout(() => {
      if (window.location.pathname.startsWith('/settings')) injectKtSettings();
    }, 100);
  };
  window.addEventListener('popstate', () => {
    if (!window.location.pathname.startsWith('/settings')) _ktHidePanel();
    if (window.location.pathname.startsWith('/settings')) setTimeout(injectKtSettings, 100);
  });

  // ===== /settings ページ統合 =====

  let _ktActive = false;
  let _ktMobNavObserver = null;

  function _findMobileNav() {
    return document.querySelector('div.p-4 > nav');
  }

  function _doInjectMobileNavBtn(mobileNav) {
    if (document.getElementById('kt-mob-nav-btn')) return;
    const btn = document.createElement('button');
    btn.id = 'kt-mob-nav-btn';
    btn.className = 'flex w-full items-center justify-between px-4 py-4 text-left transition-colors hover:bg-[var(--surface-soft)]';
    btn.innerHTML = `<div class="min-w-0 pr-4"><div class="font-medium text-[var(--text-primary)]">Karotter Translator</div><div class="mt-1 text-xs text-[var(--text-muted)]">翻訳拡張機能の設定を管理します。</div></div><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;color:var(--text-muted)"><path d="m9 18 6-6-6-6"/></svg>`;
    mobileNav.insertBefore(btn, mobileNav.firstChild);
    btn.addEventListener('click', () => {
      renderKtSettingsPanel();
    });
    // 他のナビボタンをクリックしたらパネルを閉じる
    [...mobileNav.querySelectorAll('button:not(#kt-mob-nav-btn)')].forEach(b => {
      b.addEventListener('click', () => _ktHidePanel());
    });
  }

  function injectKtSettingsMobileNavItem() {
    if (!window.location.pathname.startsWith('/settings')) return;
    if (document.getElementById('kt-mob-nav-btn')) return;

    const mobileNav = _findMobileNav();
    if (mobileNav) {
      _doInjectMobileNavBtn(mobileNav);
      return;
    }

    // nav がまだ DOM にない場合は MutationObserver で出現を待つ
    if (_ktMobNavObserver) return; // 既に監視中
    _ktMobNavObserver = new MutationObserver(() => {
      if (!window.location.pathname.startsWith('/settings')) {
        _ktMobNavObserver.disconnect();
        _ktMobNavObserver = null;
        return;
      }
      const nav = _findMobileNav();
      if (nav) {
        _ktMobNavObserver.disconnect();
        _ktMobNavObserver = null;
        _doInjectMobileNavBtn(nav);
      }
    });
    _ktMobNavObserver.observe(document.body ?? document.documentElement, { childList: true, subtree: true });
    // 10秒後に自動解除
    setTimeout(() => {
      _ktMobNavObserver?.disconnect();
      _ktMobNavObserver = null;
    }, 10000);
  }

  const _KT_LANGS = [
    '日本語', '英語', '中国語（簡体字）', '中国語（繁体字）',
    '韓国語', 'フランス語', 'スペイン語', 'ドイツ語',
    'イタリア語', 'ポルトガル語', 'ロシア語', 'アラビア語',
    'ヒンディー語', 'タイ語', 'ベトナム語', 'インドネシア語',
  ];

  function injectKtSettings() {
    injectKtSettingsNavItem();
    injectKtSettingsMobileNavItem();
  }

  // 初回スキャン（SPAのレンダリング遅延に対応して複数回試行）
  function initialScan() {
    document.querySelectorAll('[aria-label="リアクションを追加"]').forEach(injectTranslateButton);
    document.querySelectorAll('form').forEach(f => injectComposeTranslateButton(f));
    if (window.location.pathname.startsWith('/settings')) injectKtSettings();
  }

  initialScan();
  setTimeout(initialScan, 500);
  setTimeout(initialScan, 1500);

  function injectKtSettingsNavItem() {
    if (!window.location.pathname.startsWith('/settings')) return;
    if (document.getElementById('kt-nav-btn')) return;
    const nav = document.querySelector('aside nav.flex.flex-col');
    if (!nav) {
      setTimeout(injectKtSettingsNavItem, 300);
      return;
    }

    const existActive = [...nav.querySelectorAll('button')].find(b => b.className.includes('text-white'));
    const ACT_CLS = existActive?.className ?? '';
    const ACT_SUB = existActive?.querySelector('div:last-child')?.className ?? '';
    const INACT_CLS = 'w-full rounded-xl px-3 py-3 text-left transition text-[var(--text-secondary)] hover:bg-[var(--surface-soft)] hover:text-[var(--text-primary)]';
    const INACT_SUB = 'mt-1 text-xs leading-5 text-[var(--text-muted)]';

    const btn = document.createElement('button');
    btn.id = 'kt-nav-btn';
    btn.innerHTML = `<div class="font-semibold">Karotter Translator</div><div id="kt-nav-sub" class="${INACT_SUB}">翻訳拡張機能の設定を管理します。</div>`;
    nav.insertBefore(btn, nav.firstChild);

    const setActive = (active) => {
      _ktActive = active;
      btn.className = (active && ACT_CLS) ? ACT_CLS : INACT_CLS;
      const sub = document.getElementById('kt-nav-sub');
      if (sub) sub.className = (active && ACT_SUB) ? ACT_SUB : INACT_SUB;
      if (!active) _ktHidePanel();
    };

    setActive(_ktActive);

    btn.addEventListener('click', () => {
      [...nav.querySelectorAll('button:not(#kt-nav-btn)')].forEach(b => {
        b.className = INACT_CLS;
        const s = b.querySelector('div:last-child');
        if (s) s.className = INACT_SUB;
      });
      setActive(true);
      renderKtSettingsPanel();
    });

    [...nav.querySelectorAll('button:not(#kt-nav-btn)')].forEach(b => {
      b.addEventListener('click', () => setActive(false));
    });

    if (_ktActive) renderKtSettingsPanel();
  }

  function renderKtSettingsPanel() {
    // 再レンダリング前にクリーンアップ
    document.querySelectorAll('._kt-sub-hide').forEach(el => el.classList.remove('_kt-sub-hide'));
    document.getElementById('kt-sticky-hdr')?.remove();

    // モバイル vs PC でコンテナを切り替える
    const p4 = document.querySelector('div.p-4');
    const isMobile = !!(p4 && p4.getBoundingClientRect().height > 0);

    let container;
    if (isMobile) {
      container = p4;
    } else {
      const settingsNav = document.querySelector('aside nav.flex.flex-col');
      const aside = settingsNav?.closest('aside');
      container = aside?.nextElementSibling ?? document.querySelector('main');
    }
    if (!container) return;
    const mainEl = container;

    if (!document.getElementById('kt-sp-style')) {
      const s = document.createElement('style');
      s.id = 'kt-sp-style';
      s.textContent = `
div.p-4:has(#kt-sp)>*:not(#kt-sp),aside+*:has(#kt-sp)>*:not(#kt-sp),._kt-sub-hide{display:none!important}#kt-sp{padding:24px;max-width:560px}
#kt-sp h2{font-size:18px;font-weight:700;color:var(--text-primary);margin:0 0 4px}
#kt-sp .sub{font-size:13px;color:var(--text-muted);margin:0 0 20px}
#kt-sp .card{background:var(--surface-card,#fff);border:1px solid var(--border-soft);border-radius:12px;padding:16px 20px;margin-bottom:14px}
#kt-sp .sec{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);margin-bottom:12px}
#kt-sp .field{display:flex;flex-direction:column;gap:5px;margin-bottom:12px}
#kt-sp .field:last-child{margin-bottom:0}
#kt-sp .lbl{font-size:12px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em}
#kt-sp .hint{font-size:11px;color:var(--text-muted)}
#kt-sp input[type=text],#kt-sp input[type=url],#kt-sp input[type=password],#kt-sp input[type=number],#kt-sp select{padding:8px 10px;border:1px solid var(--border-soft);border-radius:6px;font-size:13px;color:var(--text-primary);background:var(--surface-card,#fff);outline:none;width:100%;transition:border-color .15s;box-sizing:border-box;font-family:inherit}
#kt-sp input:focus,#kt-sp select:focus{border-color:var(--accent,#2563eb)}
#kt-sp .master{display:flex;align-items:center;justify-content:space-between;background:var(--surface-soft);border:1px solid var(--border-soft);border-radius:12px;padding:14px 16px;margin-bottom:14px;cursor:pointer;user-select:none}
#kt-sp .master-lbl{font-size:14px;font-weight:600;color:var(--text-primary)}
#kt-sp .master input{display:none}
#kt-sp .tog{display:flex;align-items:center;justify-content:space-between;cursor:pointer;user-select:none}
#kt-sp .tog>span:first-child{font-size:13px;color:var(--text-secondary)}
#kt-sp .tog input{display:none}
#kt-sp .trk{position:relative;width:36px;height:20px;background:var(--neutral-200,#dce6ef);border-radius:9999px;transition:background .2s;flex-shrink:0}
#kt-sp .thm{position:absolute;top:2px;left:2px;width:16px;height:16px;background:#fff;border-radius:50%;transition:transform .2s;box-shadow:0 1px 3px rgba(0,0,0,.2)}
#kt-sp .tog input:checked~.trk,#kt-sp .master input:checked~.trk{background:var(--accent,#2563eb)}
#kt-sp .tog input:checked~.trk .thm,#kt-sp .master input:checked~.trk .thm{transform:translateX(16px)}
#kt-sp .row{display:flex;gap:6px}
#kt-sp .row>input,#kt-sp .row>select{flex:1}
#kt-sp .icn{flex-shrink:0;display:flex;align-items:center;justify-content:center;width:36px;height:36px;border:1px solid var(--border-soft);border-radius:6px;background:var(--surface-card,#fff);color:var(--text-muted);cursor:pointer;transition:color .15s,border-color .15s}
#kt-sp .icn:hover:not(:disabled){color:#dc2626;border-color:#dc2626}
#kt-sp .icn:disabled{opacity:.3;cursor:not-allowed}
#kt-sp .sbtn{flex-shrink:0;padding:8px 12px;border-radius:6px;border:none;background:var(--accent,#2563eb);color:#fff;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap;transition:filter .15s;font-family:inherit}
#kt-sp .sbtn:hover{filter:brightness(.9)}
#kt-sp .warn{display:none;align-items:flex-start;gap:6px;background:#fefce8;border:1px solid #fde047;border-radius:8px;padding:10px 12px;font-size:12px;color:#854d0e;line-height:1.5;margin-top:8px}
#kt-sp .warn.on{display:flex}
@media(prefers-color-scheme:dark){#kt-sp .warn{background:#2d2200;border-color:#a16207;color:#fcd34d}}
#kt-sp .sgrid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-top:10px}
#kt-sp .sv{font-size:16px;font-weight:700;color:var(--text-primary)}
#kt-sp .sl{font-size:11px;color:var(--text-muted);margin-top:2px}
#kt-sp .shdr{display:flex;align-items:center;justify-content:space-between}
#kt-sp .rstbtn{font-size:11px;color:var(--text-muted);background:none;border:none;cursor:pointer;text-decoration:underline;text-underline-offset:2px;padding:0;font-family:inherit}
#kt-sp .rstbtn:hover{color:#dc2626}
#kt-sp hr{border:none;border-top:1px solid var(--border-soft);margin:12px 0}
#kt-sp .savbtn{display:flex;align-items:center;justify-content:center;gap:6px;width:100%;padding:12px;border-radius:10px;border:none;background:var(--accent,#2563eb);color:#fff;font-size:14px;font-weight:600;cursor:pointer;transition:filter .15s;font-family:inherit;margin-bottom:8px}
#kt-sp .savbtn:hover{filter:brightness(.9)}
#kt-sp .st{font-size:12px;text-align:center;padding:6px;border-radius:6px;min-height:28px}
#kt-sp .st.ok{background:rgba(37,99,235,.1);color:var(--accent,#2563eb)}
#kt-sp .st.err{background:#fee2e2;color:#991b1b}
#kt-sp #kt-sp-dbg{display:none}
#kt-sp #kt-sp-dbg.on{display:flex}`;
      document.head.appendChild(s);
    }

    document.getElementById('kt-sp')?.remove();
    const _panel = document.createElement('div');
    _panel.id = 'kt-sp';

    const lo = _KT_LANGS.map(l => `<option value="${l}">${l}</option>`).join('');
    _panel.innerHTML = `
  <h2>Karotter Translator</h2>
  <p class="sub">翻訳拡張機能の設定を管理します。</p>

  <label class="master">
    <span class="master-lbl">翻訳機能を有効にする</span>
    <input type="checkbox" id="ks-en">
    <span class="trk"><span class="thm"></span></span>
  </label>

  <div class="card">
    <div class="sec">プリセット</div>
    <div class="field">
      <div class="row">
        <select id="ks-preset"><option value="">— 選択して切り替え —</option></select>
        <button class="icn" id="ks-pdel" title="削除" disabled>
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
        </button>
      </div>
    </div>
    <div class="field">
      <div class="row">
        <input type="text" id="ks-pname" placeholder="プリセット名を入力して保存">
        <button class="sbtn" id="ks-psave">保存</button>
      </div>
    </div>
  </div>

  <div class="card">
    <div class="sec">API設定</div>
    <div class="field">
      <label class="lbl" for="ks-url">Base URL</label>
      <input type="url" id="ks-url" placeholder="https://api.openai.com/v1">
      <span class="hint">OpenAI互換APIのエンドポイント</span>
    </div>
    <div class="field">
      <label class="lbl" for="ks-key">API Key</label>
      <input type="password" id="ks-key" placeholder="sk-...">
    </div>
    <div class="field">
      <label class="lbl" for="ks-model">モデル</label>
      <input type="text" id="ks-model" placeholder="gpt-4o-mini">
      <span class="hint">使用するモデルID（例: gpt-4o, gemma-3-27b-it）</span>
    </div>
  </div>

  <div class="card">
    <div class="sec">翻訳設定</div>
    <div class="field">
      <label class="lbl" for="ks-lang">翻訳先デフォルト言語</label>
      <select id="ks-lang">${lo}</select>
      <span class="hint">投稿一覧の「翻訳」ボタンで使う言語</span>
    </div>
    <div class="field">
      <label class="lbl" for="ks-ctx">スレッドコンテキスト取得数</label>
      <input type="number" id="ks-ctx" min="0" placeholder="0">
      <span class="hint">返信翻訳時に遡る投稿数（0 = 無制限）</span>
    </div>
    <div class="field">
      <label class="lbl" for="ks-conc">自動翻訳の同時実行数</label>
      <input type="number" id="ks-conc" min="-1" max="10" placeholder="3">
      <span class="hint">一度に並列翻訳する最大数（0 以下 = 無制限）</span>
    </div>
  </div>

  <div class="card">
    <div class="sec">オプション</div>
    <label class="tog">
      <span>自動翻訳モード</span>
      <input type="checkbox" id="ks-auto">
      <span class="trk"><span class="thm"></span></span>
    </label>
    <div class="warn" id="ks-awarn">
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0;margin-top:1px"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>
      <span>投稿が表示されるたびに自動で翻訳します。表示中の全投稿がAPIを呼び出すため、コストが大幅に増加する場合があります。</span>
    </div>
    <hr>
    <label class="tog" id="kt-sp-dbg">
      <span>デバッグモード</span>
      <input type="checkbox" id="ks-debug">
      <span class="trk"><span class="thm"></span></span>
    </label>
  </div>

  <div class="card">
    <div class="shdr">
      <div class="sec" style="margin:0">使用状況</div>
      <button class="rstbtn" id="ks-sreset">リセット</button>
    </div>
    <div class="sgrid">
      <div><div class="sv" id="ks-sreq">—</div><div class="sl">リクエスト数</div></div>
      <div><div class="sv" id="ks-sin">—</div><div class="sl">入力トークン</div></div>
      <div><div class="sv" id="ks-sout">—</div><div class="sl">出力トークン</div></div>
    </div>
  </div>

  <button class="savbtn" id="ks-save">
    <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
    設定を保存
  </button>
  <div class="st" id="ks-st"></div>
`;
    mainEl.appendChild(_panel);

    // モバイルのみ: stickyヘッダー・サブページ非表示・スクロールトップ
    if (isMobile) {
      if (!document.getElementById('kt-sticky-hdr')) {
        const hdr = document.createElement('div');
        hdr.id = 'kt-sticky-hdr';
        hdr.className = 'sticky top-0 z-10 border-b border-[var(--border-soft)] bg-[color-mix(in_srgb,var(--surface-card)_92%,transparent)] px-4 py-4 backdrop-blur';
        hdr.innerHTML = `<div class="flex w-full items-center gap-3"><button id="kt-sticky-back" class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full transition-colors hover:bg-[var(--surface-soft)]" aria-label="戻る"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg></button><div class="min-w-0"><h1 class="text-lg font-semibold text-[var(--text-primary)] md:text-xl">Karotter Translator</h1></div></div>`;
        mainEl.parentElement.insertBefore(hdr, mainEl);
        document.getElementById('kt-sticky-back').addEventListener('click', _ktHidePanel);
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });

      // サブページ（プロフィール等）が開いていたら隠す
      const minHScreen = mainEl.closest('[class*="min-h-screen"]');
      if (minHScreen) {
        const anchor = [...minHScreen.children].find(c => c.contains(mainEl));
        if (anchor) {
          let sib = anchor.nextElementSibling;
          while (sib) {
            sib.classList.add('_kt-sub-hide');
            sib = sib.nextElementSibling;
          }
        }
      }
    }

    initKtSettingsForm();
  }

  function _ktHidePanel() {
    document.querySelectorAll('._kt-sub-hide').forEach(el => el.classList.remove('_kt-sub-hide'));
    document.getElementById('kt-sticky-hdr')?.remove();
    document.getElementById('kt-sp')?.remove();
  }

  function initKtSettingsForm() {
    const g = id => document.getElementById(id);
    const d = {
      enabled:       getSetting('enabled', true),
      baseUrl:       getSetting('baseUrl', ''),
      apiKey:        getSetting('apiKey', ''),
      model:         getSetting('model', 'gpt-4o-mini'),
      language:      getSetting('language', '日本語'),
      maxContext:    getSetting('maxContext', 0),
      maxConcurrent: getSetting('maxConcurrent', 3),
      autoTranslate: getSetting('autoTranslate', false),
    };

    g('ks-en').checked    = d.enabled;
    g('ks-url').value     = d.baseUrl;
    g('ks-key').value     = d.apiKey;
    g('ks-model').value   = d.model;
    g('ks-lang').value    = d.language;
    g('ks-ctx').value     = d.maxContext;
    g('ks-conc').value    = d.maxConcurrent;
    g('ks-auto').checked  = d.autoTranslate;
    g('ks-debug').checked = getSetting('debugMode', false);
    if (getSetting('debugMode', false)) g('kt-sp-dbg').classList.add('on');
    _ktToggleAutoWarn(d.autoTranslate);

    _ktLoadPresets();
    _ktRefreshStats();

    // 即時反映トグル（enabled）
    g('ks-en').addEventListener('change', e => {
      setSetting('enabled', e.target.checked);
      extensionEnabled = e.target.checked;
      applyExtensionEnabled(e.target.checked);
    });

    g('ks-auto').addEventListener('change', e => _ktToggleAutoWarn(e.target.checked));

    // デバッグ行（h2を5回クリックで表示）
    let _dc = 0;
    g('kt-sp').querySelector('h2').addEventListener('click', () => {
      if (++_dc >= 5) g('kt-sp-dbg').classList.add('on');
    });

    // プリセット選択
    g('ks-preset').addEventListener('change', e => {
      const id = e.target.value;
      g('ks-pdel').disabled = !id;
      if (!id) return;
      const presets = getSetting('configPresets', []);
      const p = presets.find(p => p.id === id);
      if (!p) return;
      g('ks-url').value   = p.baseUrl;
      g('ks-key').value   = p.apiKey;
      g('ks-model').value = p.model;
      setSetting('baseUrl', p.baseUrl);
      setSetting('apiKey', p.apiKey);
      setSetting('model', p.model);
      setSetting('activePresetId', id);
    });

    // プリセット保存
    g('ks-psave').addEventListener('click', () => {
      const name    = g('ks-pname').value.trim();
      const baseUrl = g('ks-url').value.trim();
      const apiKey  = g('ks-key').value.trim();
      const model   = g('ks-model').value.trim() || 'gpt-4o-mini';
      if (!name) { alert('プリセット名を入力してください'); return; }
      if (!baseUrl || !apiKey) { alert('Base URL と API Key を入力してください'); return; }
      const presets = getSetting('configPresets', []);
      const id = Date.now().toString();
      setSetting('configPresets', [...presets, { id, name, baseUrl, apiKey, model }]);
      g('ks-pname').value = '';
      _ktLoadPresets();
      g('ks-preset').value = id;
      g('ks-pdel').disabled = false;
    });

    // プリセット削除
    g('ks-pdel').addEventListener('click', () => {
      const sel  = g('ks-preset');
      const id   = sel.value;
      const name = sel.selectedOptions[0]?.textContent;
      if (!id) return;
      if (!confirm(`「${name}」を削除しますか？`)) return;
      const presets = getSetting('configPresets', []);
      setSetting('configPresets', presets.filter(p => p.id !== id));
      if (getSetting('activePresetId', '') === id) setSetting('activePresetId', '');
      _ktLoadPresets();
    });

    // 統計リセット
    g('ks-sreset').addEventListener('click', () => {
      if (!confirm('使用状況をリセットしますか？')) return;
      setSetting('stats', { requests: 0, promptTokens: 0, completionTokens: 0 });
      _ktRefreshStats();
    });

    // 保存ボタン
    g('ks-save').addEventListener('click', () => {
      const baseUrl       = g('ks-url').value.trim();
      const apiKey        = g('ks-key').value.trim();
      const model         = g('ks-model').value.trim() || 'gpt-4o-mini';
      const language      = g('ks-lang').value;
      const maxContext    = parseInt(g('ks-ctx').value)  || 0;
      const maxConcurrent = parseInt(g('ks-conc').value) || 3;
      const autoTranslate = g('ks-auto').checked;
      const debugMode     = g('ks-debug').checked;
      const st = g('ks-st');
      if (!baseUrl || !apiKey) {
        st.textContent = 'Base URL と API Key は必須です';
        st.className = 'st err';
        return;
      }
      setSetting('baseUrl', baseUrl);
      setSetting('apiKey', apiKey);
      setSetting('model', model);
      setSetting('language', language);
      setSetting('maxContext', maxContext);
      setSetting('maxConcurrent', maxConcurrent);
      setSetting('autoTranslate', autoTranslate);
      setSetting('debugMode', debugMode);
      autoTranslateEnabled = autoTranslate;
      autoTranslateMaxConcurrent = maxConcurrent;
      st.textContent = '設定を保存しました';
      st.className = 'st ok';
      setTimeout(() => { st.textContent = ''; st.className = 'st'; }, 2000);
    });
  }

  function _ktToggleAutoWarn(on) {
    document.getElementById('ks-awarn')?.classList.toggle('on', on);
  }

  function _ktLoadPresets() {
    const sel = document.getElementById('ks-preset');
    if (!sel) return;
    const presets = getSetting('configPresets', []);
    const active  = getSetting('activePresetId', '');
    sel.innerHTML = '<option value="">— 選択して切り替え —</option>';
    presets.forEach(p => {
      const o = document.createElement('option');
      o.value = p.id; o.textContent = p.name;
      sel.appendChild(o);
    });
    sel.value = active;
    const del = document.getElementById('ks-pdel');
    if (del) del.disabled = !sel.value;
  }

  function _ktRefreshStats() {
    const stats = getSetting('stats', {});
    const fmt = n => n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'K' : String(n);
    const upd = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = fmt(v); };
    upd('ks-sreq', stats.requests         || 0);
    upd('ks-sin',  stats.promptTokens     || 0);
    upd('ks-sout', stats.completionTokens || 0);
  }

})();
