# Karotter Translator

![version](https://img.shields.io/badge/version-1.0.0-blue?style=flat-square)
![manifest](https://img.shields.io/badge/manifest-v3-brightgreen?style=flat-square)
![license](https://img.shields.io/github/license/kav0tter/karotter-translator?style=flat-square)
![platform](https://img.shields.io/badge/platform-Chrome-yellow?style=flat-square&logo=googlechrome&logoColor=white)
![karotter studio](https://img.shields.io/badge/karotter_studio-compatible-blueviolet?style=flat-square)

**[karotter.com](https://karotter.com) をそのまま多言語で読み書きするChrome拡張。**

好きなLLM・好きな言語で、タイムラインの閲覧から返信の下書きまで。言語の壁をカロートから取り除きます。

> karotter studioと組み合わせることで、完全にテーマに馴染んだ翻訳体験が得られます。
> → [karotter studio](https://github.com/NamiCode-Dev/Karotter-Studio)

---

## Features

### ワンクリック翻訳
タイムライン・投稿詳細のすべての投稿に翻訳ボタンを表示。クリックで翻訳、もう一度クリックで原文に戻る。翻訳結果はキャッシュされるため、APIコールは最小限。

### フォーム翻訳 + 元に戻す
カロート・返信・引用カロートのフォームに翻訳ボタンを追加。言語を選択してクリックするとテキストがその場で翻訳され、「元に戻す」で原文に復元できます。

### スレッドコンテキスト対応
返信スレッドや引用元の投稿をコンテキストとしてLLMに渡し、代名詞・固有名詞・ニュアンスの精度を引き上げます。「彼」が誰なのかを理解した翻訳が返ってきます。

### karotter studioテーマ自動追従
karotter studioがインストールされていれば、アクセントカラーや文字色がそのまま翻訳ボタンに適用されます。どのテーマを使っていても浮きません。

### 好きなLLMで動かす
OpenAI互換エンドポイントであれば何でも使用可能。クラウドAPIからローカルLLMまで対応。

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

---

## セットアップ

拡張機能アイコンをクリックしてサイドパネルを開き、設定を入力して保存します。

| 項目 | 説明 |
|---|---|
| Base URL | OpenAI互換APIのエンドポイント |
| API Key | 各サービスのAPIキー |
| モデル | 使用するモデルID（例: `gpt-4o-mini`、`gemini-2.0-flash`） |
| 翻訳先デフォルト言語 | 投稿一覧の翻訳ボタンで使う言語 |
| スレッドコンテキスト取得数 | 参照する過去投稿の件数（0 = 無制限） |

---

## Roadmap

- [ ] Firefox対応
- [ ] Chrome Web Store公開
- [ ] Firefox Add-ons公開

---

developed by [@v0](https://karotter.com/profile/v0)
