<div align="center">

<img src="docs/assets/banner.svg" alt="cyberouter-bulk-creator" width="720">

# cyberouter-bulk-creator

**批量、端到端地创建 [Cyberouter](https://router.enclave.ai)（router.enclave.ai）账户与 API 密钥，通过 [tempmail.cloud](https://tempmail.cloud) 临时邮箱完成验证,并用 [CapSolver](https://capsolver.com) 破解 Cloudflare Turnstile 挑战。**

[![License: MIT](https://img.shields.io/badge/license-MIT-38e1ff.svg?style=flat-square)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-8b5cff.svg?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org)
[![Playwright](https://img.shields.io/badge/playwright-1.47.2-2ead33.svg?style=flat-square&logo=playwright&logoColor=white)](https://playwright.dev)
[![Platform](https://img.shields.io/badge/platform-cyberouter-0b1020.svg?style=flat-square)](https://router.enclave.ai)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-38e1ff.svg?style=flat-square)](CONTRIBUTING.md)
[![No CI](https://img.shields.io/badge/CI-none-lightgrey.svg?style=flat-square)](#设计理念)

[English](README.md) · [Bahasa Indonesia](README.id.md) · **中文** · [Español](README.es.md) · [日本語](README.ja.md)

</div>

---

## 功能说明

一条命令即可端到端创建 Cyberouter 账户和 API 密钥：

1. 在 **tempmail.cloud** 生成一个全新的临时邮箱(通过其 JSON API)。
2. 用 **CapSolver** 破解 Cyberouter 的 Cloudflare Turnstile。
3. 向 **Cyberouter** 请求登录验证码。
4. 从临时收件箱读取邮件中的验证码。
5. 登录并创建 **`sk-cyberouter_...` API 密钥**。
6. 将结果写入 JSON 文件。

它用 Playwright 驱动真实的 Cyberouter 浏览器流程,因此 cookie、CSRF 令牌与
平台 HTML 表单 POST 的行为与真人一致;只有 Turnstile 令牌在浏览器之外获取,
因为该控件是 deferred 的,自动化浏览器无法完成。

## 快速开始

```bash
git clone https://github.com/your-org/cyberouter-bulk-creator.git
cd cyberouter-bulk-creator
npm install
npx playwright install --with-deps chromium
cp .env.example .env
# 然后在 .env 中填入 CAPSOLVER_KEY (https://dashboard.capsolver.com)

# 一个账户
node src/index.mjs

# 五个账户，每次两个
node src/index.mjs -n 5 --concurrency 2
```

结果输出到 `cyberouter-accounts-<timestamp>.json`：

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

成功账户创建后也会立即追加到两个持久文件(均被 git 忽略):

`results.json` — 持续增长的 JSON 数组,存放成功账户对象:

```json
[
  {
    "email": "bright.7b06a5@digital.tempmail.cloud",
    "api_key": "sk-cyberouter_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    "key_name": "prod-token-7421",
    "email_provider": "tempmail.cloud (digital.tempmail.cloud)",
    "created_at": "2026-10-03T00:00:00.000Z"
  }
]
```

`results.txt` — 每次成功一行 `email|api_key`:

```
bright.7b06a5@digital.tempmail.cloud|sk-cyberouter_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

## 命令行参数

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `-n, --count N` | 账户数量 | `1` |
| `-d, --domain D` | tempmail 收件域名 | tempmail 默认 |
| `-o, --out FILE` | 输出 JSON 文件 | `cyberouter-accounts-<ts>.json` |
| `--results-json FILE` | 追加成功账户(JSON 数组) | `results.json` |
| `--results-txt FILE` | 每次成功追加 `email|api_key` | `results.txt` |
| `-t, --timeout MS` | 等待验证邮件的上限 | `180000` |
| `--turnstile-timeout MS` | 等待 CapSolver 的上限 | `120000` |
| `--retries N` | 每个账户的重试次数 | `3` |
| `--concurrency N` | 并发账户数 | `1` |
| `--key-name NAME` | 固定 API 密钥名称 | 随机 |
| `--capsolver-key KEY` | CapSolver API 密钥 | `CAPSOLVER_KEY` |
| `--proxy URL` | 浏览器与 API 代理 | 无 |
| `--headful` | 显示浏览器 | 关闭 |
| `--keep-browser` | 结束时保持浏览器打开 | 关闭 |
| `--doctor` | 检查运行环境 | – |
| `-q, --quiet` | 仅输出摘要 | 关闭 |

## 配置

将 `.env.example` 复制为 `.env`。命令行参数优先于环境变量，环境变量优先于
默认值。

```dotenv
CAPSOLVER_KEY=your-capsolver-key
CYBEROUTER_DOMAIN=
CYBEROUTER_COUNT=1
CYBEROUTER_CONCURRENCY=1
CYBEROUTER_RETRIES=3
CYBEROUTER_TIMEOUT=180000
CYBEROUTER_TURNSTILE_TIMEOUT=120000
CYBEROUTER_RESULTS_JSON=results.json
CYBEROUTER_RESULTS_TXT=results.txt
CYBEROUTER_PROXY=
```

## 难点与处理方式

| 挑战 | 症状 | 处理 |
|------|------|------|
| **Cyberouter 的 Turnstile** | deferred `execute` 控件无法完成;提交无反应 | 用 CapSolver 破解并注入令牌到 `cf-turnstile-response` |
| **提交时机** | 提交时 context 被销毁 | 在下一个 tick 提交,让注入的 evaluate 先完成 |
| **邮件延迟** | 验证码迟迟不到 | 有上限轮询 tempmail.cloud API 并返回 `mail-timeout` |
| **验证码过期** | “invalid or expired” | 标记为 `code-expired`,换新邮箱重试 |
| **速率限制** | HTTP 429 / “too many” | 标记为 `rate-limit` 并中止(重试无效) |
| **代理泄露** | 请求绕过代理 | 代理配置在浏览器 context 上;邮箱 API 复用同一代理 |

## 环境要求

- **Node.js 18+**（在 24 上测试通过）
- **CapSolver API 密钥**并有余额——用于破解 Turnstile 挑战。
- 出口 IP 能通过 Cloudflare。干净的住宅或 VPS IP 最可靠。

运行 `node src/index.mjs --doctor` 检查环境。

## 设计理念

本仓库刻意保持精简：

- **无 CI。** 没有 workflow。请在本地运行 `node --check` 和 `--doctor`。
- **无路线图。** 欢迎 issue 与 pull request，但不公布计划。
- **无版本发布。** `main` 分支即项目本身。

## 常见问题

**哪个 tempmail 域名可用?**
tempmail.cloud 的任意活跃收件域名都可用;Cyberouter 邮件会投递到服务分配的域名。仅在需要时用 `-d`/`--domain` 固定一个。

**为什么一个任务用两个 context?**
Cyberouter 会话与 tempmail.cloud API 相互隔离:收件箱 API 通过 Playwright `APIRequestContext` 运行,共享出口代理但不共享 Cyberouter cookie jar。因此 `--concurrency` 会创建独立的平台 context。

**可以在服务器上无头运行吗?**
可以。Turnstile 由 CapSolver 破解,无需交互式浏览器。

**之后还能再看到 API 密钥吗？**
不能。Cyberouter 仅显示一次。密钥写入输出 JSON，请妥善保存（已被 git 忽略）。

## 免责声明

本工具自动化第三方注册流程。请仅在获得授权的场景使用，并遵守 Cyberouter
与 tempmail.cloud、CapSolver 的服务条款。作者与这些服务无关联,对误用不承担责任。

## 许可证

[MIT](LICENSE) © cyberouter-bulk-creator 贡献者
