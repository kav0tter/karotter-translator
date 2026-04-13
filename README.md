# Karotter Translator

**[karotter.com](https://karotter.com) をそのまま多言語で読み書きする Chrome 拡張。**  
好きな LLM・好きな言語で、投稿の翻訳から返信の下書きまでをカバーします。

---

## 何ができるか

### 読む：投稿をワンクリック翻訳
タイムライン・投稿詳細のすべての投稿に翻訳ボタンを表示。クリックで即翻訳、もう一度クリックで原文に戻ります。翻訳結果はキャッシュされるので、何度押しても API コールは1回だけ。

### 書く：フォームの文章を翻訳して置換
カロート・返信・引用カロートのフォームに翻訳ボタンを追加。言語を選んで押すと入力欄のテキストがその場で翻訳されます。「元に戻す」で原文にも戻せます。

### 賢い：スレッドの文脈を読む
返信スレッドや引用元の投稿をコンテキストとして LLM に渡し、代名詞・固有名詞・ニュアンスの解像度を上げます。「彼」が誰のことかを理解した翻訳が返ってきます。

### 馴染む：karotter studio のテーマに自動追従
[karotter studio](https://github.com/NamiCode-Dev/Karotter-Studio) がインストールされていれば、アクセントカラーや文字色がそのまま翻訳ボタンに適用されます。どのテーマを使っていても浮きません。

---

## 対応 API

OpenAI 互換エンドポイントであれば何でも使えます。

| サービス | Base URL |
|---|---|
| OpenAI | `https://api.openai.com/v1` |
| Google Gemini | `https://generativelanguage.googleapis.com/v1beta/openai` |
| OpenRouter | `https://openrouter.ai/api/v1` |
| Ollama（ローカル） | `http://localhost:11434/v1` |

---

## インストール

Chrome Web Store への公開準備中のため、現在は手動インストールです。

```
1. このリポジトリを Clone または ZIP でダウンロード・展開
2. Chrome で chrome://extensions を開く
3. 右上の「デベロッパーモード」をオン
4. 「パッケージ化されていない拡張機能を読み込む」→ フォルダを選択
```

## セットアップ

拡張機能アイコンをクリックしてサイドパネルを開き、以下を設定して保存します。

| 項目 | 説明 |
|---|---|
| Base URL | OpenAI 互換 API のエンドポイント |
| API Key | 各サービスの API キー |
| モデル | 使用するモデル ID（例: `gpt-4o-mini`） |
| 翻訳先デフォルト言語 | 投稿一覧の翻訳ボタンで使う言語 |
| スレッドコンテキスト取得数 | 参照する過去投稿の件数（0 = 無制限） |

---

## 今後の予定

- [ ] Firefox 対応
- [ ] Chrome Web Store 公開
- [ ] Firefox Add-ons 公開

---

developed by [@v0](https://karotter.com/profile/v0)
