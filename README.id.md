<div align="center">

<img src="docs/assets/banner.svg" alt="cyberouter-bulk-creator" width="720">

# cyberouter-bulk-creator

**Pembuatan massal akun & API key [Cyberouter](https://router.enclave.ai) (router.enclave.ai) secara end-to-end, diverifikasi lewat inbox sementara [tempmail.cloud](https://tempmail.cloud), dengan tantangan Cloudflare Turnstile dipecahkan oleh [CapSolver](https://capsolver.com).**

[![License: MIT](https://img.shields.io/badge/license-MIT-38e1ff.svg?style=flat-square)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-8b5cff.svg?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org)
[![Playwright](https://img.shields.io/badge/playwright-1.47.2-2ead33.svg?style=flat-square&logo=playwright&logoColor=white)](https://playwright.dev)
[![Platform](https://img.shields.io/badge/platform-cyberouter-0b1020.svg?style=flat-square)](https://router.enclave.ai)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-38e1ff.svg?style=flat-square)](CONTRIBUTING.md)
[![No CI](https://img.shields.io/badge/CI-none-lightgrey.svg?style=flat-square)](#filosofi)

[English](README.md) · **Bahasa Indonesia** · [中文](README.zh.md) · [Español](README.es.md) · [日本語](README.ja.md)

</div>

---

## Apa yang dilakukan

Satu perintah membuat akun Cyberouter beserta API key, dari awal hingga akhir:

1. Membuat email sementara baru di **tempmail.cloud** (lewat JSON API-nya).
2. Memecahkan Cloudflare Turnstile Cyberouter dengan **CapSolver**.
3. Meminta kode masuk dari **Cyberouter**.
4. Membaca kode dari inbox sementara tadi.
5. Masuk dan membuat **API key `sk-cyberouter_...`**.
6. Menyimpan semuanya ke file JSON.

Proses menjalankan form browser Cyberouter sungguhan dengan Playwright, sehingga
cookie, token CSRF, dan form HTML platform berperilaku sama seperti untuk
manusia; hanya token Turnstile yang diambil di luar browser, karena widget-nya
bersifat deferred dan tidak akan selesai di browser otomatis.

## Mulai cepat

```bash
git clone https://github.com/your-org/cyberouter-bulk-creator.git
cd cyberouter-bulk-creator
npm install
npx playwright install --with-deps chromium
cp .env.example .env
# lalu isi CAPSOLVER_KEY di .env (https://dashboard.capsolver.com)

# satu akun
node src/index.mjs

# lima akun, dua sekaligus
node src/index.mjs -n 5 --concurrency 2
```

Hasil tersimpan di `cyberouter-accounts-<timestamp>.json`:

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

| Flag | Keterangan | Default |
|------|------------|---------|
| `-n, --count N` | jumlah akun | `1` |
| `-d, --domain D` | domain penerima tempmail | default tempmail |
| `-o, --out FILE` | file JSON keluaran | `cyberouter-accounts-<ts>.json` |
| `-t, --timeout MS` | batas tunggu email masuk | `180000` |
| `--turnstile-timeout MS` | batas tunggu CapSolver | `120000` |
| `--retries N` | percobaan ulang per akun | `3` |
| `--concurrency N` | akun paralel | `1` |
| `--key-name NAME` | nama API key tetap | acak |
| `--capsolver-key KEY` | API key CapSolver | `CAPSOLVER_KEY` |
| `--proxy URL` | proxy untuk browser & API | tidak ada |
| `--headful` | tampilkan browser | mati |
| `--keep-browser` | biarkan browser terbuka | mati |
| `--doctor` | cek lingkungan | – |
| `-q, --quiet` | ringkasan saja | mati |

## Konfigurasi

Salin `.env.example` menjadi `.env`. Flag CLI menimpa nilai environment, yang
menimpa default.

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

## Bagian tersulit (dan penanganannya)

| Tantangan | Gejala | Penanganan |
|-----------|--------|------------|
| **Turnstile di Cyberouter** | widget `execute` deferred tak pernah selesai; submit tak terjadi | Dipecahkan via CapSolver, token disuntik ke `cf-turnstile-response` |
| **Waktu submit** | context hancur saat submit | Submit pada tick berikutnya agar evaluate penyuntikan selesai dulu |
| **Email lambat** | kode tak kunjung tiba | Polling berbatas ke API tempmail.cloud dengan error `mail-timeout` |
| **Kode kedaluwarsa** | "invalid or expired" | Ditandai `code-expired`, dicoba ulang dengan inbox baru |
| **Batas laju** | HTTP 429 / "too many" | Ditandai `rate-limit`, dihentikan (retry tak membantu) |
| **Proxy bocor** | request melewati proxy | Proxy dipasang di context browser; API inbox ikut memakainya |

## Kebutuhan

- **Node.js 18+** (diuji di 24)
- **Chromium** via `npx playwright install --with-deps chromium` (butuh apt)
- **API key CapSolver** dengan saldo — untuk memecahkan tantangan Turnstile.
- IP keluar yang lolos Cloudflare. IP residensial atau VPS bersih paling andal.

Jalankan `node src/index.mjs --doctor` untuk memeriksa lingkungan.

## Filosofi

Repositori ini sengaja minimal:

- **Tanpa CI.** Tidak ada workflow. Jalankan `node --check` dan `--doctor` lokal.
- **Tanpa roadmap.** Issue dan pull request dipersilakan; tidak ada rencana resmi.
- **Tanpa rilis versi.** Branch `main` adalah proyeknya.

## FAQ

**Domain tempmail mana yang bekerja?**
Semua domain penerima aktif tempmail.cloud bekerja; email Cyberouter dikirim ke
domain yang ditetapkan layanan. Pin satu domain dengan `-d`/`--domain` hanya
bila perlu.

**Kenapa dua context untuk satu tugas?**
Sesi Cyberouter dan API tempmail.cloud diisolasi: API inbox berjalan lewat
`APIRequestContext` Playwright yang berbagi proxy keluar tetapi bukan cookie
jar Cyberouter. Karena itu `--concurrency` membuat context platform terpisah.

**Bisakah headless di server?**
Bisa. Turnstile dipecahkan CapSolver, jadi browser interaktif tidak diperlukan.

**Apakah API key bisa dilihat lagi?**
Tidak. Cyberouter menampilkannya sekali. Tersimpan di JSON keluaran; jaga file
itu (sudah di-git-ignore).

## Penafian

Alat ini mengotomatiskan alur pendaftaran pihak ketiga. Gunakan hanya di tempat
Anda berwenang, sesuai ketentuan Cyberouter, tempmail.cloud, dan CapSolver.
Penulis tidak berafiliasi dengan layanan mana pun dan tidak bertanggung jawab
atas penyalahgunaan.

## Lisensi

[MIT](LICENSE) © kontributor cyberouter-bulk-creator
