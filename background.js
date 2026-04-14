// background.js - OpenAI互換APIへのリクエストをservice workerで処理

// 拡張機能アイコンクリックでサイドパネルを開く
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'TRANSLATE') {
    handleTranslate(message.payload)
      .then(result => sendResponse({ success: true, data: result }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true; // 非同期レスポンスのためtrueを返す
  }
});

async function handleTranslate({ text, targetLanguage, sourceLanguage, context, authorName, authorHandle, debug }) {
  const { baseUrl, apiKey, model, language } = await chrome.storage.sync.get([
    'baseUrl',
    'apiKey',
    'model',
    'language',
  ]);

  if (!baseUrl || !apiKey) {
    throw new Error('設定が未完了です。拡張機能のアイコンから設定を行ってください。');
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

  const modelKey = `${model || 'gpt-4o-mini'}@${baseUrl}`;
  const { compatFlags = {} } = await chrome.storage.local.get('compatFlags');
  const needsFallback = compatFlags[modelKey] ?? false;

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
    console.log('[KT] system prompt:\n', systemPrompt);
    console.log('[KT] user prompt:\n', userPrompt);
    console.log('[KT] model:', model, needsFallback ? '(fallbackモード)' : '');
  }

  const fetchRequest = (body) => fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  });

  let response = await fetchRequest(buildBody(needsFallback));

  // 400エラー時、まだフォールバック未使用ならリトライしてモデルを記憶
  if (response.status === 400 && !needsFallback) {
    const errorText = await response.text();
    if (debug) console.log('[KT] 400エラー、フォールバックリトライ:', errorText);

    response = await fetchRequest(buildBody(true));

    if (!response.ok) {
      const fallbackError = await response.text();
      throw new Error(`API エラー (${response.status}): ${fallbackError}`);
    }

    // 成功したのでフォールバックが必要なモデルとして記憶
    await chrome.storage.local.set({
      compatFlags: { ...compatFlags, [modelKey]: true },
    });
    if (debug) console.log('[KT] フォールバックモードを記憶:', modelKey);
  } else if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API エラー (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error('APIから空のレスポンスが返されました');
  }

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error('APIレスポンスのJSONパースに失敗しました');
  }

  if (typeof parsed.translated_text !== 'string') {
    throw new Error('APIレスポンスの形式が不正です');
  }

  // トークン使用量を累積保存
  const usage = data.usage;
  if (usage) {
    const { stats = {} } = await chrome.storage.local.get('stats');
    await chrome.storage.local.set({
      stats: {
        promptTokens:     (stats.promptTokens     || 0) + (usage.prompt_tokens     || 0),
        completionTokens: (stats.completionTokens || 0) + (usage.completion_tokens || 0),
        requests:         (stats.requests         || 0) + 1,
      },
    });
  }

  if (debug) {
    console.log('[KT] APIレスポンス ─────────────────');
    console.log('[KT]', parsed);
    if (usage) console.log('[KT] usage:', usage);
  }

  return parsed;
}
