// content.js - karotter.comの投稿に翻訳ボタンを注入する

const PROCESSED_ATTR = 'data-kt-translated';

// 翻訳キャッシュ（オリジナルテキスト → 翻訳結果）
const translationCache = new Map();
const CACHE_MAX_SIZE = 100;
const CACHE_STORAGE_KEY = 'translationCache';

// 起動時にキャッシュを復元
(async () => {
  try {
    const { [CACHE_STORAGE_KEY]: saved } = await chrome.storage.local.get(CACHE_STORAGE_KEY);
    if (Array.isArray(saved)) saved.forEach(([k, v]) => translationCache.set(k, v));
  } catch { /* ignore */ }
})();

async function cacheSet(key, value) {
  // 既存キーは一度削除して末尾（最新）に追加
  translationCache.delete(key);
  translationCache.set(key, value);
  // 上限超えなら先頭（最古）を削除
  if (translationCache.size > CACHE_MAX_SIZE) {
    translationCache.delete(translationCache.keys().next().value);
  }
  try {
    await chrome.storage.local.set({ [CACHE_STORAGE_KEY]: [...translationCache.entries()] });
  } catch { /* ignore */ }
}

// ========== 拡張機能オン/オフ ==========

let extensionEnabled = true;

(async () => {
  try {
    const { enabled } = await chrome.storage.sync.get(['enabled']);
    extensionEnabled = enabled ?? true;
    applyExtensionEnabled(extensionEnabled);
  } catch { /* ignore */ }
})();

function applyExtensionEnabled(val) {
  document.body.classList.toggle('kt-disabled', !val);
}

try {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && 'enabled' in changes) {
      extensionEnabled = changes.enabled.newValue ?? true;
      applyExtensionEnabled(extensionEnabled);
    }
  });
} catch { /* ignore */ }

// ========== 自動翻訳モード ==========

let autoTranslateEnabled = false;

(async () => {
  try {
    const { autoTranslate } = await chrome.storage.sync.get(['autoTranslate']);
    autoTranslateEnabled = autoTranslate ?? false;
  } catch { /* 拡張機能コンテキスト未準備 */ }
})();

try {
  chrome.storage.onChanged.addListener((changes) => {
    if ('autoTranslate' in changes) autoTranslateEnabled = changes.autoTranslate.newValue;
  });
} catch { /* ignore */ }

// 自動翻訳（同時実行数制限付き）
let autoTranslateMaxConcurrent = 3;
let autoTranslateActive = 0;
const autoTranslatePending = [];

(async () => {
  try {
    const { maxConcurrent } = await chrome.storage.sync.get(['maxConcurrent']);
    autoTranslateMaxConcurrent = maxConcurrent ?? 3;
  } catch { /* ignore */ }
})();

try {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes.maxConcurrent) {
      autoTranslateMaxConcurrent = changes.maxConcurrent.newValue ?? 3;
    }
  });
} catch { /* ignore */ }

function drainAutoTranslate() {
  while ((autoTranslateMaxConcurrent <= 0 || autoTranslateActive < autoTranslateMaxConcurrent) && autoTranslatePending.length > 0) {
    const btn = autoTranslatePending.shift();
    if (!document.body.contains(btn) || btn.classList.contains('kt-translated')) {
      continue; // 消えた・翻訳済みはスキップ
    }
    autoTranslateActive++;
    btn.click();
    // disabled が解除されたらスロット返却
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

// ========== 投稿コンテナの特定 ==========
// [aria-label="リアクションを追加"] ボタンを基点にする（ページ種別を問わず安定）

function getPostContainer(reactionBtn) {
  // reaction btn → action bar div → actions wrapper div → content div (flex-1)
  return reactionBtn?.parentElement?.parentElement?.parentElement;
}

// post card (div.w-full.border-b) を返す
function getPostCard(reactionBtn) {
  return getPostContainer(reactionBtn)?.parentElement?.parentElement;
}

// ========== スレッドコンテキスト取得 ==========

function extractPostData(reactionBtn) {
  const container = getPostContainer(reactionBtn);
  if (!container) return null;
  // ヘッダー（名前・ハンドル）はcontainer直下の最初のdivにある
  // p.whitespace-pre-wrap より前の要素に限定することで本文内メンションを除外
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

// textElより前の兄弟要素をまとめたdivを返す
function getPreviousSiblings(el, parent) {
  const wrapper = document.createElement('div');
  let node = parent.firstChild;
  while (node && node !== el) {
    wrapper.appendChild(node.cloneNode(true));
    node = node.nextSibling;
  }
  return wrapper;
}

// 返信モーダル内の返信元投稿を抽出（rounded-xl + border 構造）
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
  // 引用投稿: rounded-2xl + border クラスを持ち p.whitespace-pre-wrap を含む要素
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

  // ---- 詳細ページ: 現在の投稿より前にある祖先投稿を全取得 ----
  if (isDetailPage) {
    const allBtns = [...document.querySelectorAll('[aria-label="リアクションを追加"]')];
    const currentIdx = allBtns.indexOf(currentReactionBtn);
    if (currentIdx > 0) {
      const ancestors = allBtns.slice(0, currentIdx);
      const limited = maxContext > 0 ? ancestors.slice(-maxContext) : ancestors;
      context.push(...limited.map(extractPostData).filter(Boolean));
    }
  } else {
    // ---- タイムライン: 「返信先:」テキストから返信相手のハンドルを取得 ----
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

  // ---- 引用投稿: ページ種別問わず現在の投稿内から取得 ----
  const container = getPostContainer(currentReactionBtn);
  const quoted = extractQuotedPost(container);
  if (quoted) context.push(quoted);

  return context;
}

// ========== 投稿一覧の翻訳ボタン ==========

function injectTranslateButton(reactionBtn) {
  if (!extensionEnabled) return;
  const container = getPostContainer(reactionBtn);
  if (!container || container.hasAttribute(PROCESSED_ATTR)) return;
  container.setAttribute(PROCESSED_ATTR, '1');

  const textEl = container.querySelector('p.whitespace-pre-wrap');
  if (!textEl) return;

  // 翻訳ボタン行をテキストの直後に挿入（画像より前）
  const btnRow = document.createElement('div');
  btnRow.className = 'kt-translate-btn-row';

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'kt-translate-btn';
  btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 8 6 6"/><path d="m4 14 6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/><path d="m22 22-5-10-5 10"/><path d="M14 18h6"/></svg><span class="kt-btn-label">翻訳</span>`;

  btnRow.appendChild(btn);
  // textElの直後に挿入（画像・メディアより前になる）
  textEl.insertAdjacentElement('beforebegin', btnRow);

  // 自動翻訳モードが有効なら翻訳をキューに積む
  if (autoTranslateEnabled) enqueueAutoTranslate(btn);

  let originalText = null;
  let isTranslated = false;

  btn.addEventListener('click', async (e) => {
    e.stopPropagation();
    e.preventDefault();
    // 翻訳済みなら元に戻す
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
      // キャッシュヒット確認（コンテキストなしのテキストキーで管理）
      let result = translationCache.get(currentText);
      if (!result) {
        const { maxContext = 0, debugMode = false } = await getStorage(['maxContext', 'debugMode']);
        const context = getThreadContext(reactionBtn, maxContext);
        const authorData = extractPostData(reactionBtn);

        if (debugMode) {
          console.log('[KT] 翻訳リクエスト ─────────────────');
          console.log('[KT] 投稿テキスト:', currentText);
          console.log('[KT] 投稿者:', authorData);
          console.log('[KT] コンテキスト:', context.length + '件', context);
        }

        // コンテキスト件数をバッジ表示
        if (debugMode && context.length > 0) {
          btn.querySelector('.kt-btn-label').textContent = `翻訳中... [ctx:${context.length}]`;
        }

        const payload = {
          text: currentText,
          context,
          authorName: authorData?.displayName,
          authorHandle: authorData?.handle,
          debug: debugMode,
        };

        const response = await sendMessageWithRetry({ type: 'TRANSLATE', payload });
        if (!response.success) throw new Error(response.error);
        result = response.data;
        cacheSet(currentText, result);

        if (debugMode) {
          console.log('[KT] 翻訳レスポンス ─────────────────');
          console.log('[KT]', result);
        }
      } else if (await getStorage(['debugMode']).then(d => d.debugMode)) {
        console.log('[KT] キャッシュヒット:', currentText.substring(0, 30) + '...');
      }

      const { translated_text, is_same_language, source_language, target_language } = result;

      if (is_same_language) {
        if (!btn.dataset.ktAuto) showToast('同じ言語のため翻訳をスキップしました');
        btn.querySelector('.kt-btn-label').textContent = '翻訳';
        btn.disabled = false;
        return;
      }

      // 元テキストを保存してから書き換え
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

// ========== 最近使用した翻訳先言語の管理 ==========

const MAX_RECENT_LANGS = 3;

async function getRecentLanguages() {
  try {
    const { recentLanguages } = await chrome.storage.local.get(['recentLanguages']);
    return recentLanguages || [];
  } catch { return []; }
}

async function saveRecentLanguage(lang) {
  try {
    const recent = await getRecentLanguages();
    const updated = [lang, ...recent.filter(l => l !== lang)].slice(0, MAX_RECENT_LANGS);
    await chrome.storage.local.set({ recentLanguages: updated });
  } catch { /* ignore */ }
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

// ========== 投稿・返信画面の翻訳ボタン ==========

const COMPOSE_SUBMIT_LABELS = ['カロート', '返信', '引用カロート'];

function injectComposeTranslateButton(root) {
  if (!extensionEnabled) return;
  // rootはモーダルでもformでも可。formを基準に処理する
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

  // 最近使用した言語 + 設定デフォルトを非同期で反映
  (async () => {
    const [{ language }, recent] = await Promise.all([
      getStorage(['language']),
      getRecentLanguages(),
    ]);
    const fallback = language === '英語' ? '日本語' : '英語';
    const selectedLang = recent[0] ?? (LANGUAGES.includes(fallback) ? fallback : LANGUAGES[0]);
    buildLangOptions(langSelect, LANGUAGES, recent, selectedLang);
  })();

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

    // 翻訳済みなら元に戻す
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
      const { maxContext = 0, debugMode = false } = await getStorage(['maxContext', 'debugMode']);

      const isModal = !!form.closest('.fixed.inset-0');
      const modal = form.closest('.fixed.inset-0') ?? form.parentElement;
      const context = [];

      if (isModal) {
        // 返信元投稿（rounded-xl構造）をコンテキストに追加
        const replyTarget = extractReplyTarget(form);
        if (replyTarget) context.push(replyTarget);
        // 引用元投稿（rounded-2xl構造）をコンテキストに追加
        const quoted = extractQuotedPost(modal);
        if (quoted) context.push(quoted);
      } else {
        // インラインフォーム（詳細ページの返信）: スレッド上の投稿をコンテキストにする
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
        const response = await sendMessageWithRetry({
          type: 'TRANSLATE',
          payload: { text, targetLanguage: langSelect.value, context, debug: debugMode },
        });
        if (!response.success) throw new Error(response.error);
        result = response.data;
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

      // 使用した言語を履歴に保存しセレクトを再構築
      const usedLang = langSelect.value;
      saveRecentLanguage(usedLang).then(async () => {
        const recent = await getRecentLanguages();
        buildLangOptions(langSelect, LANGUAGES, recent, usedLang);
      });
    } catch (err) {
      showToast(`翻訳エラー: ${err.message}`, 'error');
      translateBtn.innerHTML = btnInner();
    } finally {
      translateBtn.disabled = false;
    }
  });

  container.appendChild(langSelect);
  container.appendChild(translateBtn);

  // 文字数カウンター（submitの兄弟）を探して、その前に挿入
  const toolbar = submitBtn.parentElement;
  const charCount = [...toolbar.children].find(
    el => el !== submitBtn && el.textContent.trim().match(/^\d+$/)
  );
  toolbar.insertBefore(container, charCount ?? submitBtn);
}

function tryInjectCompose(el) {
  // モーダル経由
  const modal = el.matches?.('.fixed.inset-0') ? el : el.querySelector?.('.fixed.inset-0');
  if (modal) {
    setTimeout(() => injectComposeTranslateButton(modal), 200);
    return;
  }
  // インラインform経由（投稿詳細ページなど）
  const forms = el.matches?.('form') ? [el] : [...(el.querySelectorAll?.('form') ?? [])];
  forms.forEach(f => setTimeout(() => injectComposeTranslateButton(f), 100));
}

// ========== React管理のtextarea更新 ==========

function setNativeValue(element, value) {
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLTextAreaElement.prototype,
    'value'
  ).set;
  nativeInputValueSetter.call(element, value);
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
}

// ========== 拡張機能コンテキスト有効チェック ==========

function isChromeApiAvailable() {
  try {
    return typeof chrome !== 'undefined' && !!chrome.storage?.sync;
  } catch {
    return false;
  }
}

async function getStorage(keys) {
  if (!isChromeApiAvailable()) throw new Error('拡張機能が無効です。ページをリロードしてください。');
  try {
    return await chrome.storage.sync.get(keys);
  } catch (e) {
    if (e.message?.includes('Extension context invalidated')) {
      throw new Error('拡張機能が再読み込みされました。ページをリロードしてください。');
    }
    throw e;
  }
}

// ========== メッセージ送信（リトライ付き） ==========

async function sendMessageWithRetry(message, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await chrome.runtime.sendMessage(message);
      if (response) return response;
    } catch (e) {
      // コンテキスト無効はリトライ不可のため即終了
      if (e.message?.includes('Extension context invalidated')) {
        throw new Error('拡張機能が再読み込みされました。ページをリロードしてください。');
      }
      // 最後のリトライで失敗したら投げる
      if (i === retries - 1) throw new Error(`拡張機能のコンテキストエラー: ${e.message}`);
    }
    await new Promise(r => setTimeout(r, 300 * (i + 1)));
  }
  throw new Error('Service Workerが応答しません。拡張機能を再読み込みしてください。');
}

// ========== ユーティリティ ==========

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


// ========== 投稿・モーダルの検出 ==========

function processElement(el) {
  if (el.nodeType !== Node.ELEMENT_NODE) return;

  el.querySelectorAll('[aria-label="リアクションを追加"]').forEach(injectTranslateButton);
  if (el.matches('[aria-label="リアクションを追加"]')) injectTranslateButton(el);

  tryInjectCompose(el);

  if (window.location.pathname.startsWith('/settings')) {
    injectKtSettingsNavItem();
    injectKtSettingsMobileNavItem();
  }
}

const observer = new MutationObserver(mutations => {
  for (const mutation of mutations) {
    mutation.addedNodes.forEach(processElement);
  }
});

observer.observe(document.body, { childList: true, subtree: true });

document.querySelectorAll('[aria-label="リアクションを追加"]').forEach(injectTranslateButton);
// 初期表示のインラインform（投稿詳細ページ）
document.querySelectorAll('form').forEach(f => injectComposeTranslateButton(f));
// SPA ナビゲーション検知
const _ktOrigPushState = history.pushState.bind(history);
history.pushState = function (...args) {
  _ktOrigPushState(...args);
  if (!window.location.pathname.startsWith('/settings')) _ktHidePanel();
  setTimeout(_ktInitialSettingsScan, 100);
};
window.addEventListener('popstate', () => {
  if (!window.location.pathname.startsWith('/settings')) _ktHidePanel();
  setTimeout(_ktInitialSettingsScan, 100);
});

// ========== /settings ページ統合 ==========

let _ktActive = false;
let _ktMobNavObserver = null;

const _KT_LANGS = [
  '日本語', '英語', '中国語（簡体字）', '中国語（繁体字）',
  '韓国語', 'フランス語', 'スペイン語', 'ドイツ語',
  'イタリア語', 'ポルトガル語', 'ロシア語', 'アラビア語',
  'ヒンディー語', 'タイ語', 'ベトナム語', 'インドネシア語',
];

function _ktFindMobileNav() {
  return document.querySelector('div.p-4 > nav');
}

function _ktDoInjectMobileNavBtn(mobileNav) {
  if (document.getElementById('kt-mob-nav-btn')) return;
  const btn = document.createElement('button');
  btn.id = 'kt-mob-nav-btn';
  btn.className = 'flex w-full items-center justify-between px-4 py-4 text-left transition-colors hover:bg-[var(--surface-soft)]';
  btn.innerHTML = `<div class="min-w-0 pr-4"><div class="font-medium text-[var(--text-primary)]">Karotter Translator</div><div class="mt-1 text-xs text-[var(--text-muted)]">翻訳拡張機能の設定を管理します。</div></div><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;color:var(--text-muted)"><path d="m9 18 6-6-6-6"/></svg>`;
  mobileNav.insertBefore(btn, mobileNav.firstChild);
  btn.addEventListener('click', () => {
    renderKtSettingsPanel();
    document.querySelector('main')?.scrollIntoView({ behavior: 'smooth' });
  });
  // 他のナビボタンをクリックしたらパネルを閉じる
  [...mobileNav.querySelectorAll('button:not(#kt-mob-nav-btn)')].forEach(b => {
    b.addEventListener('click', () => _ktHidePanel());
  });
}

function injectKtSettingsMobileNavItem() {
  if (!window.location.pathname.startsWith('/settings')) return;
  if (document.getElementById('kt-mob-nav-btn')) return;
  const mobileNav = _ktFindMobileNav();
  if (mobileNav) {
    _ktDoInjectMobileNavBtn(mobileNav);
    return;
  }
  if (_ktMobNavObserver) return;
  _ktMobNavObserver = new MutationObserver(() => {
    if (!window.location.pathname.startsWith('/settings')) {
      _ktMobNavObserver.disconnect(); _ktMobNavObserver = null; return;
    }
    const nav = _ktFindMobileNav();
    if (nav) {
      _ktMobNavObserver.disconnect(); _ktMobNavObserver = null;
      _ktDoInjectMobileNavBtn(nav);
    }
  });
  _ktMobNavObserver.observe(document.body, { childList: true, subtree: true });
  setTimeout(() => { _ktMobNavObserver?.disconnect(); _ktMobNavObserver = null; }, 10000);
}

function _ktInitialSettingsScan() {
  if (window.location.pathname.startsWith('/settings')) {
    injectKtSettingsNavItem();
    injectKtSettingsMobileNavItem();
  }
}
_ktInitialSettingsScan();
setTimeout(_ktInitialSettingsScan, 500);
setTimeout(_ktInitialSettingsScan, 1500);

function injectKtSettingsNavItem() {
  if (!window.location.pathname.startsWith('/settings')) return;
  if (document.getElementById('kt-nav-btn')) return;
  const nav = document.querySelector('aside nav.flex.flex-col');
  if (!nav) {
    setTimeout(injectKtSettingsNavItem, 300);
    return;
  }

  // 現在アクティブなボタンのクラスを取得してテーマに合わせる
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
    // 他の設定ボタンを視覚的にinactiveに戻す
    [...nav.querySelectorAll('button:not(#kt-nav-btn)')].forEach(b => {
      b.className = INACT_CLS;
      const s = b.querySelector('div:last-child');
      if (s) s.className = INACT_SUB;
    });
    setActive(true);
    renderKtSettingsPanel();
  });

  // 他ボタンのクリックでKT設定を非アクティブに
  [...nav.querySelectorAll('button:not(#kt-nav-btn)')].forEach(b => {
    b.addEventListener('click', () => setActive(false));
  });

  if (_ktActive) renderKtSettingsPanel();
}

function renderKtSettingsPanel() {
  const mainEl = document.querySelector('main');
  if (!mainEl) return;

  // スタイルをheadに1回だけ注入
  if (!document.getElementById('kt-sp-style')) {
    const s = document.createElement('style');
    s.id = 'kt-sp-style';
    s.textContent = `
#kt-sp{padding:24px;max-width:560px}
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

  // Reactのコンテンツを隠す（削除しない → ナビが引き続き機能する）
  [...mainEl.children].forEach(el => { if (el.id !== 'kt-sp') el.hidden = true; });
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
  <div class="st" id="ks-st"></div>`;
  mainEl.appendChild(_panel);

  initKtSettingsForm();
}

function initKtSettingsForm() {
  const g = id => document.getElementById(id);

  chrome.storage.sync.get(
    ['enabled', 'baseUrl', 'apiKey', 'model', 'language', 'maxContext', 'maxConcurrent', 'autoTranslate', 'debugMode'],
    (d) => {
      if (!g('ks-url')) return; // パネルが消えた場合
      g('ks-en').checked   = d.enabled       ?? true;
      g('ks-url').value    = d.baseUrl        || '';
      g('ks-key').value    = d.apiKey         || '';
      g('ks-model').value  = d.model          || 'gpt-4o-mini';
      g('ks-lang').value   = d.language       || '日本語';
      g('ks-ctx').value    = d.maxContext     ?? 0;
      g('ks-conc').value   = d.maxConcurrent  ?? 3;
      g('ks-auto').checked  = d.autoTranslate  ?? false;
      g('ks-debug').checked = d.debugMode      ?? false;
      if (d.debugMode) g('kt-sp-dbg').classList.add('on');
      _ktToggleAutoWarn(d.autoTranslate ?? false);
    }
  );

  _ktLoadPresets();
  _ktLoadStats();

  // 即時反映トグル（enabled）
  g('ks-en').addEventListener('change', e => {
    chrome.storage.sync.set({ enabled: e.target.checked });
    extensionEnabled = e.target.checked;
    applyExtensionEnabled(e.target.checked);
  });

  // 自動翻訳警告
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
    chrome.storage.sync.get('configPresets', ({ configPresets = [] }) => {
      const p = configPresets.find(p => p.id === id);
      if (!p) return;
      g('ks-url').value   = p.baseUrl;
      g('ks-key').value   = p.apiKey;
      g('ks-model').value = p.model;
      chrome.storage.sync.set({ baseUrl: p.baseUrl, apiKey: p.apiKey, model: p.model, activePresetId: id });
    });
  });

  // プリセット保存
  g('ks-psave').addEventListener('click', () => {
    const name    = g('ks-pname').value.trim();
    const baseUrl = g('ks-url').value.trim();
    const apiKey  = g('ks-key').value.trim();
    const model   = g('ks-model').value.trim() || 'gpt-4o-mini';
    if (!name) { alert('プリセット名を入力してください'); return; }
    if (!baseUrl || !apiKey) { alert('Base URL と API Key を入力してください'); return; }
    chrome.storage.sync.get('configPresets', ({ configPresets = [] }) => {
      const id = Date.now().toString();
      chrome.storage.sync.set({ configPresets: [...configPresets, { id, name, baseUrl, apiKey, model }] }, () => {
        g('ks-pname').value = '';
        _ktLoadPresets();
        g('ks-preset').value = id;
        g('ks-pdel').disabled = false;
      });
    });
  });

  // プリセット削除
  g('ks-pdel').addEventListener('click', () => {
    const sel = g('ks-preset');
    const id   = sel.value;
    const name = sel.selectedOptions[0]?.textContent;
    if (!id) return;
    if (!confirm(`「${name}」を削除しますか？`)) return;
    chrome.storage.sync.get(['configPresets', 'activePresetId'], ({ configPresets = [], activePresetId }) => {
      const updated = configPresets.filter(p => p.id !== id);
      chrome.storage.sync.set(
        { configPresets: updated, ...(activePresetId === id ? { activePresetId: '' } : {}) },
        _ktLoadPresets
      );
    });
  });

  // 統計リセット
  g('ks-sreset').addEventListener('click', () => {
    if (!confirm('使用状況をリセットしますか？')) return;
    chrome.storage.local.set({ stats: { requests: 0, promptTokens: 0, completionTokens: 0 } }, _ktLoadStats);
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
    chrome.storage.sync.set({ baseUrl, apiKey, model, language, maxContext, maxConcurrent, autoTranslate, debugMode }, () => {
      autoTranslateEnabled = autoTranslate;
      autoTranslateMaxConcurrent = maxConcurrent;
      st.textContent = '設定を保存しました';
      st.className = 'st ok';
      setTimeout(() => { st.textContent = ''; st.className = 'st'; }, 2000);
    });
  });
}

function _ktHidePanel() {
  document.getElementById('kt-sp')?.remove();
  const mainEl = document.querySelector('main');
  if (mainEl) [...mainEl.children].forEach(el => { el.hidden = false; });
}

function _ktToggleAutoWarn(on) {
  document.getElementById('ks-awarn')?.classList.toggle('on', on);
}

function _ktLoadPresets() {
  chrome.storage.sync.get(['configPresets', 'activePresetId'], ({ configPresets = [], activePresetId = '' }) => {
    const sel = document.getElementById('ks-preset');
    if (!sel) return;
    sel.innerHTML = '<option value="">— 選択して切り替え —</option>';
    configPresets.forEach(p => {
      const o = document.createElement('option');
      o.value = p.id; o.textContent = p.name;
      sel.appendChild(o);
    });
    sel.value = activePresetId;
    const del = document.getElementById('ks-pdel');
    if (del) del.disabled = !sel.value;
  });
}

function _ktLoadStats() {
  chrome.storage.local.get('stats', ({ stats = {} }) => {
    const fmt = n => n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'K' : String(n);
    const upd = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = fmt(v); };
    upd('ks-sreq', stats.requests        || 0);
    upd('ks-sin',  stats.promptTokens    || 0);
    upd('ks-sout', stats.completionTokens || 0);
  });
}

// 統計の自動更新（設定パネルが開いているとき）
try {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.stats) _ktLoadStats();
  });
} catch { /* ignore */ }
