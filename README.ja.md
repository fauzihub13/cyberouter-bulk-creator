<div align="center">

<img src="docs/assets/banner.svg" alt="cyberouter-bulk-creator" width="720">

# cyberouter-bulk-creator

**[Cyberouter](https://router.enclave.ai)（router.enclave.ai）のアカウントと API キーを、[zenvex.dev](https://zenvex.dev) の一時受信トレイで検証しながら、一括かつエンドツーエンドで作成します。**

[![License: MIT](https://img.shields.io/badge/license-MIT-38e1ff.svg?style=flat-square)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-8b5cff.svg?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org)
[![Playwright](https://img.shields.io/badge/playwright-1.47.2-2ead33.svg?style=flat-square&logo=playwright&logoColor=white)](https://playwright.dev)
[![Platform](https://img.shields.io/badge/platform-cyberouter-0b1020.svg?style=flat-square)](https://router.enclave.ai)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-38e1ff.svg?style=flat-square)](CONTRIBUTING.md)
[![No CI](https://img.shields.io/badge/CI-none-lightgrey.svg?style=flat-square)](#設計思想)

[English](README.md) · [Bahasa Indonesia](README.id.md) · [中文](README.zh.md) · [Español](README.es.md) · **日本語**

</div>

---

## できること

1 つのコマンドで、Cyberouter のアカウントと API キーをエンドツーエンドで作成します。

1. **zenvex.dev** で新しい一時メールを作成。
2. **Cyberouter** にサインインコードを要求。
3. 一時受信トレイからメールのコードを読み取る。
4. サインインして **`sk-cyberouter_...` の API キー**を作成。
5. すべてを JSON ファイルに保存。

Playwright で実際のブラウザを操作するため、Cloudflare Turnstile と各社の
HTML フォーム POST は人間の操作とまったく同じように動作します。

## クイックスタート

```bash
git clone https://github.com/your-org/cyberouter-bulk-creator.git
cd cyberouter-bulk-creator
npm install
npx playwright install --with-deps chromium
cp .env.example .env

# 1 アカウント
node src/index.mjs

# 5 アカウントを 2 並列で
node src/index.mjs -n 5 --concurrency 2
```

結果は `cyberouter-accounts-<timestamp>.json` に出力されます。

```json
[
  {
    "ok": true,
    "email": "swiftfox482913@souss.dev",
    "api_key": "sk-cyberouter_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    "key_name": "prod-token-7421",
    "email_provider": "zenvex.dev (souss.dev)",
    "elapsed_ms": 48210,
    "created_at": "2026-10-03T00:00:00.000Z"
  }
]
```

## CLI

| オプション | 説明 | 既定値 |
|------------|------|--------|
| `-n, --count N` | アカウント数 | `1` |
| `-d, --domain D` | zenvex の受信ドメイン | `souss.dev` |
| `-o, --out FILE` | 出力 JSON | `cyberouter-accounts-<ts>.json` |
| `-t, --timeout MS` | メール待ちの上限 | `180000` |
| `--turnstile-timeout MS` | Cloudflare 待ちの上限 | `150000` |
| `--retries N` | アカウントごとの再試行 | `3` |
| `--concurrency N` | 並列数 | `1` |
| `--key-name NAME` | 固定のキー名 | ランダム |
| `--proxy URL` | ブラウザ用プロキシ | なし |
| `--headful` | ブラウザを表示 | オフ |
| `--keep-browser` | 終了時にブラウザを残す | オフ |
| `--doctor` | 環境チェック | – |
| `-q, --quiet` | 要約のみ | オフ |

## 設定

`.env.example` を `.env` にコピーします。CLI フラグは環境変数を、環境変数は
既定値を上書きします。

```dotenv
CYBEROUTER_DOMAIN=souss.dev
CYBEROUTER_COUNT=1
CYBEROUTER_CONCURRENCY=1
CYBEROUTER_RETRIES=3
CYBEROUTER_TIMEOUT=180000
CYBEROUTER_TURNSTILE_TIMEOUT=150000
CYBEROUTER_PROXY=
```

## 難しいポイントと対処

| 課題 | 症状 | 対処 |
|------|------|------|
| **zenvex の Turnstile** | "Open Inbox" が無効のまま | トークンが発行されるまでポーリングしてからクリック |
| **一時的な Turnstile 失敗** | "security check failed" | 再読み込み・再入力してやり直す |
| **Cyberouter の Turnstile** | 送信しても反応なし | 送信前にウィジェットのトークンを待つ |
| **メール遅延** | コードが届かない | 上限付きポーリングで `mail-timeout` を返す |
| **コード失効** | "invalid or expired" | `code-expired` として新しい受信箱で再試行 |
| **レート制限** | HTTP 429 / "too many" | `rate-limit` として中断（再試行は無効） |
| **プロキシ漏れ** | リクエストが直通 | プロキシをブラウザコンテキストに設定 |

## 動作要件

- **Node.js 18+**（22 で検証）
- **Chromium**：`npx playwright install --with-deps chromium`（apt が必要）
- Cloudflare を通過できる出口 IP。クリーンな住宅用または VPS の IP が最適。
  公開の無料プロキシはほぼ Turnstile を通過できません。

`node src/index.mjs --doctor` で環境を確認できます。

## 設計思想

このリポジトリは意図的に最小構成です。

- **CI なし。** ワークフローはありません。ローカルで `node --check` と
  `--doctor` を実行してください。
- **ロードマップなし。** issue と pull request は歓迎しますが、計画は公開しません。
- **バージョンリリースなし。** `main` ブランチがプロジェクトです。

## よくある質問

**どの zenvex ドメインが使えますか？**
Cyberouter のメール受信が確認されているのは `souss.dev` です。

**なぜタスクごとにブラウザコンテキストを分けるのですか？**
一時受信箱が Cyberouter セッションと Cookie を共有してはいけないためです。

**サーバーでヘッドレス実行できますか？**
可能です。Chromium とクリーンな出口 IP が必要です。住宅用出口には
`--proxy` を使ってください。

**API キーは後で再表示できますか？**
いいえ。Cyberouter は一度しか表示しません。出力 JSON に保存されるので安全に
保管してください（git 管理外です）。

## 免責事項

本ツールはサードパーティの登録フローを自動化します。権限のある範囲でのみ、
Cyberouter および zenvex.dev の利用規約に従って使用してください。作者は
これらのサービスと無関係であり、誤用について責任を負いません。

## ライセンス

[MIT](LICENSE) © cyberouter-bulk-creator contributors
