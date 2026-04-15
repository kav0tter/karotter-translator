# Karotter Translator

![version](https://img.shields.io/badge/version-1.2.0-blue?style=flat-square)
![license](https://img.shields.io/github/license/kav0tter/karotter-translator?style=flat-square)
![Chrome](https://img.shields.io/badge/Chrome-Extension-yellow?style=flat-square&logo=googlechrome&logoColor=white)
![Firefox](https://img.shields.io/badge/Firefox-Userscript-orange?style=flat-square&logo=firefox&logoColor=white)
![Safari](https://img.shields.io/badge/Safari-Userscript-blue?style=flat-square&logo=safari&logoColor=white)
![karotter studio](https://img.shields.io/badge/karotter_studio-compatible-blueviolet?style=flat-square)

**[karotter.com](https://karotter.com) を多言語で読み書きする Chrome拡張 / Userscript。**
好きなLLM・好きな言語で、タイムラインの閲覧から返信の下書きまで対応。

> karotter studioと組み合わせると、テーマに完全に馴染んだ翻訳UIになります。
> → [karotter studio](https://github.com/NamiCode-Dev/Karotter-Studio)

---

## インストール

### Chrome拡張機能

> Chrome Web Storeへの公開準備中のため、現在は手動インストールです。

1. このリポジトリを [ZIP でダウンロード](https://github.com/kav0tter/karotter-translator/archive/refs/heads/master.zip) して展開
2. `chrome://extensions` を開き、右上の **デベロッパーモード** をオン
3. **「パッケージ化されていない拡張機能を読み込む」** → 展開したフォルダ内の `chrome/` を選択

### Userscript（Firefox / Safari / Chrome）

まずブラウザにUserscriptマネージャーをインストール：

| ブラウザ | 推奨マネージャー |
|---|---|
| Chrome | [Tampermonkey](https://chromewebstore.google.com/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo) |
| Firefox | [Tampermonkey](https://addons.mozilla.org/ja/firefox/addon/tampermonkey/) / [Violentmonkey](https://addons.mozilla.org/ja/firefox/addon/violentmonkey/) |
| Safari | [Userscripts](https://apps.apple.com/jp/app/userscripts/id1463298887) |

マネージャーをインストール後、以下のURLをブラウザで開くとインストールダイアログが表示されます：

```
https://raw.githubusercontent.com/kav0tter/karotter-translator/master/userscript/karotter-translator.user.js
```

自動更新に対応しているため、一度インストールすれば以降は手動更新不要です。

---

## セットアップ

[karotter.com/settings](https://karotter.com/settings) の「Karotter Translator」から設定できます。

| 項目 | 説明 |
|---|---|
| Base URL | OpenAI互換APIのエンドポイント |
| API Key | 各サービスのAPIキー |
| モデル | 使用するモデルID（例: `gpt-4o-mini`） |
| 翻訳先言語 | 投稿一覧の翻訳ボタンで使うデフォルト言語 |
| 自動翻訳モード | 投稿表示時に自動で翻訳するか |

**対応API例：**

| サービス | Base URL |
|---|---|
| OpenAI | `https://api.openai.com/v1` |
| Google Gemini | `https://generativelanguage.googleapis.com/v1beta/openai` |
| OpenRouter | `https://openrouter.ai/api/v1` |
| Ollama（ローカル） | `http://localhost:11434/v1` |

---

## Features

- **ワンクリック翻訳** — 全投稿に翻訳ボタンを表示。再クリックで原文に戻る
- **フォーム翻訳** — カロート・返信・引用フォームをそのまま翻訳。元に戻すボタン付き
- **自動翻訳モード** — 投稿が表示されるたびに自動翻訳。同時実行数を調整可能
- **スレッドコンテキスト** — 返信元・引用元をLLMに渡して精度向上
- **翻訳キャッシュ** — 最大100件をローカル保存（LRU）。リロード後も再翻訳しない
- **APIプリセット** — Base URL / API Key / Model の組み合わせをワンクリックで切り替え
- **トークン使用量** — リクエスト数・入出力トークンをリアルタイム表示
- **karotter studio対応** — テーマのアクセントカラーが翻訳ボタンに自動適用

---

## Roadmap

- [ ] Chrome Web Store公開
- [ ] Firefox Add-ons公開（拡張機能版）

---

developed by [@v0](https://karotter.com/profile/v0)
