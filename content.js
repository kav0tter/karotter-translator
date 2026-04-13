// content.js - karotter.comの投稿に翻訳ボタンを注入する

const PROCESSED_ATTR = 'data-kt-translated';

// 翻訳キャッシュ（オリジナルテキスト → 翻訳結果）
const translationCache = new Map();

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

// 自動翻訳キュー（APIへの同時リクエストを1件ずつに制限）
const autoTranslateQueue = [];
let autoTranslateProcessing = false;

function enqueueAutoTranslate(btn) {
  autoTranslateQueue.push(btn);
  if (!autoTranslateProcessing) processAutoTranslateQueue();
}

function processAutoTranslateQueue() {
  const btn = autoTranslateQueue.shift();
  if (!btn) { autoTranslateProcessing = false; return; }
  autoTranslateProcessing = true;

  // DOM から消えていたり既翻訳なら次へ
  if (!document.body.contains(btn) || btn.classList.contains('kt-translated')) {
    processAutoTranslateQueue();
    return;
  }

  btn.click();

  // disabled が解除されるまで待って次をキック
  const poll = setInterval(() => {
    if (!btn.disabled) {
      clearInterval(poll);
      setTimeout(processAutoTranslateQueue, 300);
    }
  }, 100);
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
        translationCache.set(currentText, result);

        if (debugMode) {
          console.log('[KT] 翻訳レスポンス ─────────────────');
          console.log('[KT]', result);
        }
      } else if (await getStorage(['debugMode']).then(d => d.debugMode)) {
        console.log('[KT] キャッシュヒット:', currentText.substring(0, 30) + '...');
      }

      const { translated_text, is_same_language, source_language, target_language } = result;

      if (is_same_language) {
        showToast('同じ言語のため翻訳をスキップしました');
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
        if (!result.is_same_language) translationCache.set(cacheKey, result);
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
  return chrome.storage.sync.get(keys);
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
