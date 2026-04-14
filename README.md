# Karotter Translator

![version](https://img.shields.io/badge/version-1.0.0-blue?style=flat-square)
![manifest](https://img.shields.io/badge/manifest-v3-brightgreen?style=flat-square)
![license](https://img.shields.io/github/license/kav0tter/karotter-translator?style=flat-square)
![Chrome](https://img.shields.io/badge/Chrome-Extension-yellow?style=flat-square&logo=googlechrome&logoColor=white)
![Firefox](https://img.shields.io/badge/Firefox-Userscript-orange?style=flat-square&logo=firefox&logoColor=white)
![Safari](https://img.shields.io/badge/Safari-Userscript-blue?style=flat-square&logo=safari&logoColor=white)
![karotter studio](https://img.shields.io/badge/karotter_studio-compatible-blueviolet?style=flat-square)

**[karotter.com](https://karotter.com) をそのまま多言語で読み書きするChrome拡張 / Userscript。**

好きなLLM・好きな言語で、タイムラインの閲覧から返信の下書きまで。言語の壁をカロートから取り除きます。

> karotter studioと組み合わせることで、完全にテーマに馴染んだ翻訳体験が得られます。
> → [karotter studio](https://github.com/NamiCode-Dev/Karotter-Studio)

---

## Features

### ワンクリック翻訳
タイムライン・投稿詳細のすべての投稿に翻訳ボタンを表示。クリックで翻訳、もう一度クリックで原文に戻る。

### 自動翻訳モード
ページに投稿が表示されるたびに自動で翻訳します。同時実行数を設定できるのでAPIのレートリミットに合わせて調整可能。

### 翻訳キャッシュの永続化
翻訳結果を最大100件ローカルに保存。ページリロード後も同じ投稿を再翻訳せずに済みます（LRU方式）。

### フォーム翻訳 + 元に戻す
カロート・返信・引用カロートのフォームに翻訳ボタンを追加。言語を選択してクリックするとテキストがその場で翻訳され、「元に戻す」で原文に復元できます。最近使った言語が上部に表示されます。

### スレッドコンテキスト対応
返信スレッドや引用元の投稿をコンテキストとしてLLMに渡し、代名詞・固有名詞・ニュアンスの精度を引き上げます。「彼」が誰なのかを理解した翻訳が返ってきます。

### APIプリセット
Base URL / API Key / Model の組み合わせをプリセットとして保存し、ワンクリックで切り替えられます。プロバイダーを複数使い分けるときに便利です。

### トークン使用量カウンター
リクエスト数・入力トークン・出力トークンをリアルタイムで表示。リセットボタンで任意のタイミングでリセットできます。

### karotter studioテーマ自動追従
karotter studioがインストールされていれば、アクセントカラーや文字色がそのまま翻訳ボタンに適用されます。どのテーマを使っていても浮きません。

### 好きなLLMで動かす
OpenAI互換エンドポイントであれば何でも使用可能。クラウドAPIからローカルLLMまで対応。非OpenAIモデル（Gemmaなど）では互換性フラグを自動検出し、次回以降は最適な形式で送信します。

---

## 対応API

| サービス | Base URL |
|---|---|
| OpenAI | `https://api.openai.com/v1` |
| Google Gemini | `https://generativelanguage.googleapis.com/v1beta/openai` |
| OpenRouter | `https://openrouter.ai/api/v1` |
| Ollama（ローカル） | `http://localhost:11434/v1` |

---

## インストール

### Chrome拡張機能

> Chrome Web Storeへの公開準備中のため、現在は手動インストールです。

**1. リポジトリをダウンロード**

```bash
git clone https://github.com/kav0tter/karotter-translator.git
```

またはページ右上の `Code → Download ZIP` から展開。

**2. Chromeに読み込む**

1. `chrome://extensions` を開く
2. 右上の **デベロッパーモード** をオン
3. **「パッケージ化されていない拡張機能を読み込む」** をクリック
4. クローン/展開したフォルダを選択

### Userscript（Firefox / Safari / Chrome）

Firefox・Safari・その他のブラウザでも Userscript として動作します。自動更新に対応しているため、一度インストールすれば以降は手動更新不要です。

| ブラウザ | 推奨マネージャー |
|---|---|
| Firefox | [Tampermonkey](https://addons.mozilla.org/ja/firefox/addon/tampermonkey/) / [Violentmonkey](https://addons.mozilla.org/ja/firefox/addon/violentmonkey/) |
| Safari | [Userscripts](https://apps.apple.com/jp/app/userscripts/id1463298887) |

マネージャーをインストール後、以下のURLをブラウザで開くとインストールダイアログが表示されます：

```
https://raw.githubusercontent.com/kav0tter/karotter-translator/master/karotter-translator.user.js
```

---

## セットアップ

設定は **karotter.com の設定ページ**（[karotter.com/settings](https://karotter.com/settings)）の「Karotter Translator」から行います。Chrome拡張機能はサイドパネルからも設定できます。

### API設定（保存ボタンで確定）

| 項目 | 説明 |
|---|---|
| プリセット | 保存済みのAPI設定を選択して即時切り替え |
| Base URL | OpenAI互換APIのエンドポイント |
| API Key | 各サービスのAPIキー |
| モデル | 使用するモデルID（例: `gpt-4o-mini`、`gemma-3-27b-it`） |
| 翻訳先デフォルト言語 | 投稿一覧の翻訳ボタンで使う言語 |
| スレッドコンテキスト取得数 | 参照する過去投稿の件数（0 = 無制限） |
| 自動翻訳の同時実行数 | 並列翻訳の上限（0以下 = 無制限） |
| 自動翻訳モード | 投稿表示時に自動翻訳するか |

### 即時反映される設定

| 項目 | 説明 |
|---|---|
| 翻訳機能を有効にする | 拡張機能全体のオン/オフ |

---

## Roadmap

- [ ] Chrome Web Store公開
- [ ] Firefox Add-ons公開（拡張機能版）

---

developed by [@v0](https://karotter.com/profile/v0)
