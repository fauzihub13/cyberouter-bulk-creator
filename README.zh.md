<div align="center">

<img src="docs/assets/banner.svg" alt="cyberouter-bulk-creator" width="720">

# cyberouter-bulk-creator

**批量、端到端地创建 [Cyberouter](https://router.enclave.ai)（router.enclave.ai）账户与 API 密钥，通过 [zenvex.dev](https://zenvex.dev) 临时邮箱完成验证。**

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

1. 在 **zenvex.dev** 生成一个全新的临时邮箱。
2. 向 **Cyberouter** 请求登录验证码。
3. 从临时收件箱读取邮件中的验证码。
4. 登录并创建 **`sk-cyberouter_...` API 密钥**。
5. 将结果写入 JSON 文件。

它使用 Playwright 驱动真实浏览器，因此 Cloudflare Turnstile 与平台的 HTML
表单 POST 的行为与真人操作完全一致。

## 快速开始

```bash
git clone https://github.com/your-org/cyberouter-bulk-creator.git
cd cyberouter-bulk-creator
npm install
npx playwright install --with-deps chromium
cp .env.example .env

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
    "email": "swiftfox482913@souss.dev",
    "api_key": "sk-cyberouter_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    "key_name": "prod-token-7421",
    "email_provider": "zenvex.dev (souss.dev)",
    "elapsed_ms": 48210,
    "created_at": "2026-10-03T00:00:00.000Z"
  }
]
```

## 命令行参数

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `-n, --count N` | 账户数量 | `1` |
| `-d, --domain D` | zenvex 收件域名 | `souss.dev` |
| `-o, --out FILE` | 输出 JSON 文件 | `cyberouter-accounts-<ts>.json` |
| `-t, --timeout MS` | 等待验证邮件的上限 | `180000` |
| `--turnstile-timeout MS` | 等待 Cloudflare 的上限 | `150000` |
| `--retries N` | 每个账户的重试次数 | `3` |
| `--concurrency N` | 并发账户数 | `1` |
| `--key-name NAME` | 固定 API 密钥名称 | 随机 |
| `--proxy URL` | 浏览器代理 | 无 |
| `--headful` | 显示浏览器 | 关闭 |
| `--keep-browser` | 结束时保持浏览器打开 | 关闭 |
| `--doctor` | 检查运行环境 | – |
| `-q, --quiet` | 仅输出摘要 | 关闭 |

## 配置

将 `.env.example` 复制为 `.env`。命令行参数优先于环境变量，环境变量优先于
默认值。

```dotenv
CYBEROUTER_DOMAIN=souss.dev
CYBEROUTER_COUNT=1
CYBEROUTER_CONCURRENCY=1
CYBEROUTER_RETRIES=3
CYBEROUTER_TIMEOUT=180000
CYBEROUTER_TURNSTILE_TIMEOUT=150000
CYBEROUTER_PROXY=
```

## 难点与处理方式

| 挑战 | 症状 | 处理 |
|------|------|------|
| **zenvex 的 Turnstile** | “Open Inbox” 按钮禁用 | 轮询直到挑战签发令牌，再点击 |
| **Turnstile 瞬时失败** | “security check failed” | 重新加载、重填地址、重试 |
| **Cyberouter 的 Turnstile** | 提交无反应 | 提交表单前等待控件令牌 |
| **邮件延迟** | 验证码迟迟不到 | 有上限轮询并返回 `mail-timeout` |
| **验证码过期** | “invalid or expired” | 标记为 `code-expired`，换新邮箱重试 |
| **速率限制** | HTTP 429 / “too many” | 标记为 `rate-limit` 并中止（重试无效） |
| **代理泄露** | 请求绕过代理 | 代理配置在浏览器 context 上 |

## 环境要求

- **Node.js 18+**（在 22 上测试通过）
- **Chromium**：`npx playwright install --with-deps chromium`（需要 apt）
- 出口 IP 能通过 Cloudflare。干净的住宅或 VPS IP 最可靠；公共免费代理几乎
  无法通过 Turnstile。

运行 `node src/index.mjs --doctor` 检查环境。

## 设计理念

本仓库刻意保持精简：

- **无 CI。** 没有 workflow。请在本地运行 `node --check` 和 `--doctor`。
- **无路线图。** 欢迎 issue 与 pull request，但不公布计划。
- **无版本发布。** `main` 分支即项目本身。

## 常见问题

**哪个 zenvex 域名可用？**
`souss.dev` 是已验证可接收 Cyberouter 邮件的域名。

**为什么每个任务使用独立的浏览器 context？**
临时收件箱不能与 Cyberouter 会话共享 cookie。

**可以在服务器上无头运行吗？**
可以，需安装 Chromium 并有干净的出口 IP。住宅出口请用 `--proxy`。

**之后还能再看到 API 密钥吗？**
不能。Cyberouter 仅显示一次。密钥写入输出 JSON，请妥善保存（已被 git 忽略）。

## 免责声明

本工具自动化第三方注册流程。请仅在获得授权的场景使用，并遵守 Cyberouter
与 zenvex.dev 的服务条款。作者与这些服务无关联，对误用不承担责任。

## 许可证

[MIT](LICENSE) © cyberouter-bulk-creator 贡献者
