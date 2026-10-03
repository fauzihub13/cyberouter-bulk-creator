<div align="center">

<img src="docs/assets/banner.svg" alt="cyberouter-bulk-creator" width="720">

# cyberouter-bulk-creator

**Pembuatan massal akun & API key [Cyberouter](https://router.enclave.ai) (router.enclave.ai) secara end-to-end, diverifikasi lewat inbox sementara [zenvex.dev](https://zenvex.dev).**

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

1. Membuat email sementara baru di **zenvex.dev**.
2. Meminta kode masuk dari **Cyberouter**.
3. Membaca kode dari inbox sementara tadi.
4. Masuk dan membuat **API key `sk-cyberouter_...`**.
5. Menyimpan semuanya ke file JSON.

Proses berjalan di browser sungguhan dengan Playwright, sehingga Cloudflare
Turnstile dan form HTML platform berperilaku sama seperti untuk manusia.

## Mulai cepat

```bash
git clone https://github.com/your-org/cyberouter-bulk-creator.git
cd cyberouter-bulk-creator
npm install
npx playwright install --with-deps chromium
cp .env.example .env

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

| Flag | Keterangan | Default |
|------|------------|---------|
| `-n, --count N` | jumlah akun | `1` |
| `-d, --domain D` | domain penerima zenvex | `souss.dev` |
| `-o, --out FILE` | file JSON keluaran | `cyberouter-accounts-<ts>.json` |
| `-t, --timeout MS` | batas tunggu email masuk | `180000` |
| `--turnstile-timeout MS` | batas tunggu Cloudflare | `150000` |
| `--retries N` | percobaan ulang per akun | `3` |
| `--concurrency N` | akun paralel | `1` |
| `--key-name NAME` | nama API key tetap | acak |
| `--proxy URL` | proxy untuk browser | tidak ada |
| `--headful` | tampilkan browser | mati |
| `--keep-browser` | biarkan browser terbuka | mati |
| `--doctor` | cek lingkungan | – |
| `-q, --quiet` | ringkasan saja | mati |

## Konfigurasi

Salin `.env.example` menjadi `.env`. Flag CLI menimpa nilai environment, yang
menimpa default.

```dotenv
CYBEROUTER_DOMAIN=souss.dev
CYBEROUTER_COUNT=1
CYBEROUTER_CONCURRENCY=1
CYBEROUTER_RETRIES=3
CYBEROUTER_TIMEOUT=180000
CYBEROUTER_TURNSTILE_TIMEOUT=150000
CYBEROUTER_PROXY=
```

## Bagian tersulit (dan penanganannya)

| Tantangan | Gejala | Penanganan |
|-----------|--------|------------|
| **Turnstile di zenvex** | tombol "Open Inbox" tetap nonaktif | Polling hingga tantangan memberi token, lalu klik |
| **Turnstile gagal sesaat** | "security check failed" | Muat ulang, isi ulang alamat, ulangi |
| **Turnstile di Cyberouter** | submit tidak terjadi | Tunggu token widget sebelum mengirim form |
| **Email lambat** | kode tak kunjung tiba | Polling berbatas dengan error `mail-timeout` |
| **Kode kedaluwarsa** | "invalid or expired" | Ditandai `code-expired`, dicoba ulang dengan inbox baru |
| **Batas laju** | HTTP 429 / "too many" | Ditandai `rate-limit`, dihentikan (retry tak membantu) |
| **Proxy bocor** | request melewati proxy | Proxy dipasang di context browser |

## Kebutuhan

- **Node.js 18+** (diuji di 22)
- **Chromium** via `npx playwright install --with-deps chromium` (butuh apt)
- IP keluar yang lolos Cloudflare. IP residensial atau VPS bersih paling andal;
  proxy gratis publik hampir selalu gagal Turnstile.

Jalankan `node src/index.mjs --doctor` untuk memeriksa lingkungan.

## Filosofi

Repositori ini sengaja minimal:

- **Tanpa CI.** Tidak ada workflow. Jalankan `node --check` dan `--doctor` lokal.
- **Tanpa roadmap.** Issue dan pull request dipersilakan; tidak ada rencana resmi.
- **Tanpa rilis versi.** Branch `main` adalah proyeknya.

## FAQ

**Domain zenvex mana yang bekerja?**
`souss.dev` yang terverifikasi menerima email Cyberouter.

**Kenapa satu context browser per tugas?**
Inbox sementara tidak boleh berbagi cookie dengan sesi Cyberouter.

**Bisakah headless di server?**
Bisa, dengan Chromium terpasang dan IP keluar bersih. Gunakan `--proxy` untuk
egress residensial.

**Apakah API key bisa dilihat lagi?**
Tidak. Cyberouter menampilkannya sekali. Tersimpan di JSON keluaran; jaga file
itu (sudah di-git-ignore).

## Penafian

Alat ini mengotomatiskan alur pendaftaran pihak ketiga. Gunakan hanya di tempat
Anda berwenang, sesuai ketentuan Cyberouter dan zenvex.dev. Penulis tidak
berafiliasi dengan layanan mana pun dan tidak bertanggung jawab atas
penyalahgunaan.

## Lisensi

[MIT](LICENSE) © kontributor cyberouter-bulk-creator
