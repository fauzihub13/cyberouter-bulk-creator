<div align="center">

<img src="docs/assets/banner.svg" alt="cyberouter-bulk-creator" width="720">

# cyberouter-bulk-creator

**[Cyberouter](https://router.enclave.ai)（router.enclave.ai）のアカウントと API キーを、[tempmail.cloud](https://tempmail.cloud) の一時受信トレイで検証しながら、一括かつエンドツーエンドで作成します。Turnstile は [CapSolver](https://capsolver.com) で解きます。**

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

1. **tempmail.cloud** で新しい一時メールを作成(JSON API 経由)。
2. **CapSolver** で Cyberouter の Cloudflare Turnstile を解きます。
3. **Cyberouter** にサインインコードを要求。
4. 一時受信トレイからメールのコードを読み取る。
5. サインインして **`sk-cyberouter_...` の API キー**を作成。
6. すべてを JSON ファイルに保存。

Playwright で実際の Cyberouter のブラウザフローを操作するため、Cookie・CSRF
トークン・HTML フォーム POST は人間の操作と同じように動作します。Turnstile
トークンのみブラウザ外で取得します。ウィジェットが遅延実行型で、自動化
ブラウザでは完了しないためです。

## クイックスタート

```bash
git clone https://github.com/your-org/cyberouter-bulk-creator.git
cd cyberouter-bulk-creator
npm install
npx playwright install --with-deps chromium
cp .env.example .env
# その後 .env に CAPSOLVER_KEY を設定 (https://dashboard.capsolver.com)

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
    "email": "bright.7b06a5@digital.tempmail.cloud",
    "api_key": "sk-cyberouter_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    "key_name": "prod-token-7421",
    "email_provider": "tempmail.cloud (digital.tempmail.cloud)",
    "elapsed_ms": 19579,
    "created_at": "2026-10-03T00:00:00.000Z"
  }
]
```

## CLI

| オプション | 説明 | 既定値 |
|------------|------|--------|
| `-n, --count N` | アカウント数 | `1` |
| `-d, --domain D` | tempmail の受信ドメイン | tempmail 既定 |
| `-o, --out FILE` | 出力 JSON | `cyberouter-accounts-<ts>.json` |
| `-t, --timeout MS` | メール待ちの上限 | `180000` |
| `--turnstile-timeout MS` | CapSolver 待ちの上限 | `120000` |
| `--retries N` | アカウントごとの再試行 | `3` |
| `--concurrency N` | 並列数 | `1` |
| `--key-name NAME` | 固定のキー名 | ランダム |
| `--capsolver-key KEY` | CapSolver API キー | `CAPSOLVER_KEY` |
| `--proxy URL` | ブラウザと API 用プロキシ | なし |
| `--headful` | ブラウザを表示 | オフ |
| `--keep-browser` | 終了時にブラウザを残す | オフ |
| `--doctor` | 環境チェック | – |
| `-q, --quiet` | 要約のみ | オフ |

## 設定

`.env.example` を `.env` にコピーします。CLI フラグは環境変数を、環境変数は
既定値を上書きします。

```dotenv
CAPSOLVER_KEY=your-capsolver-key
CYBEROUTER_DOMAIN=
CYBEROUTER_COUNT=1
CYBEROUTER_CONCURRENCY=1
CYBEROUTER_RETRIES=3
CYBEROUTER_TIMEOUT=180000
CYBEROUTER_TURNSTILE_TIMEOUT=120000
CYBEROUTER_PROXY=
```

## 難しいポイントと対処

| 課題 | 症状 | 対処 |
|------|------|------|
| **Cyberouter の Turnstile** | 遅延実行型 `execute` ウィジェットが完了せず送信が無反応 | CapSolver で解き、トークンを `cf-turnstile-response` に注入 |
| **送信タイミング** | 送信時にコンテキストが破棄される | 注入の evaluate が完了するよう次ティックで送信 |
| **メール遅延** | コードが届かない | tempmail.cloud API を上限付きでポーリングし `mail-timeout` を返す |
| **コード失効** | "invalid or expired" | `code-expired` として新しい受信箱で再試行 |
| **レート制限** | HTTP 429 / "too many" | `rate-limit` として中断(再試行は無効) |
| **プロキシ漏れ** | リクエストが直通 | プロキシをブラウザコンテキストに設定。受信箱 API も同じ proxy を共有 |

## 動作要件

- **Node.js 18+**(24 で検証)
- **Chromium**：`npx playwright install --with-deps chromium`（apt が必要）
- 残高のある **CapSolver API キー** — Turnstile を解くのに必要です。
- Cloudflare を通過できる出口 IP。クリーンな住宅用または VPS の IP が最適。

`node src/index.mjs --doctor` で環境を確認できます。

## 設計思想

このリポジトリは意図的に最小構成です。

- **CI なし。** ワークフローはありません。ローカルで `node --check` と
  `--doctor` を実行してください。
- **ロードマップなし。** issue と pull request は歓迎しますが、計画は公開しません。
- **バージョンリリースなし。** `main` ブランチがプロジェクトです。

## よくある質問

**どの tempmail ドメインが使えますか?**
tempmail.cloud の有効な受信ドメインはすべて使えます。Cyberouter のメールは
サービスが割り当てたドメインに届きます。固定したい場合のみ `-d`/`--domain`
を使ってください。

**なぜ 1 タスクに 2 つのコンテキストを使うのですか?**
Cyberouter セッションと tempmail.cloud API は分離されています。受信箱 API は
Playwright の `APIRequestContext` で実行し、出口プロキシは共有しますが
Cyberouter の Cookie ジャーは共有しません。そのため `--concurrency` は
独立したプラットフォームコンテキストを作成します。

**サーバーでヘッドレス実行できますか?**
可能です。Turnstile は CapSolver が解くため、対話型ブラウザは不要です。

**API キーは後で再表示できますか？**
いいえ。Cyberouter は一度しか表示しません。出力 JSON に保存されるので安全に
保管してください（git 管理外です）。

## 免責事項

本ツールはサードパーティの登録フローを自動化します。権限のある範囲でのみ、
Cyberouter、tempmail.cloud、CapSolver の利用規約に従って使用してください。作者は
これらのサービスと無関係であり、誤用について責任を負いません。

## ライセンス

[MIT](LICENSE) © cyberouter-bulk-creator contributors
