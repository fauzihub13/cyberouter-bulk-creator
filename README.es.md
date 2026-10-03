<div align="center">

<img src="docs/assets/banner.svg" alt="cyberouter-bulk-creator" width="720">

# cyberouter-bulk-creator

**Aprovisionamiento masivo y de extremo a extremo de cuentas y claves API de [Cyberouter](https://router.enclave.ai) (router.enclave.ai), verificado con bandejas temporales de [zenvex.dev](https://zenvex.dev).**

[![License: MIT](https://img.shields.io/badge/license-MIT-38e1ff.svg?style=flat-square)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-8b5cff.svg?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org)
[![Playwright](https://img.shields.io/badge/playwright-1.47.2-2ead33.svg?style=flat-square&logo=playwright&logoColor=white)](https://playwright.dev)
[![Platform](https://img.shields.io/badge/platform-cyberouter-0b1020.svg?style=flat-square)](https://router.enclave.ai)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-38e1ff.svg?style=flat-square)](CONTRIBUTING.md)
[![No CI](https://img.shields.io/badge/CI-none-lightgrey.svg?style=flat-square)](#filosofía)

[English](README.md) · [Bahasa Indonesia](README.id.md) · [中文](README.zh.md) · **Español** · [日本語](README.ja.md)

</div>

---

## Qué hace

Un solo comando crea cuentas de Cyberouter y sus claves API, de principio a fin:

1. Genera un correo temporal nuevo en **zenvex.dev**.
2. Solicita un código de acceso a **Cyberouter**.
3. Lee el código del correo en la bandeja temporal.
4. Inicia sesión y crea una **clave API `sk-cyberouter_...`**.
5. Guarda todo en un archivo JSON.

Usa un navegador real con Playwright, por lo que Cloudflare Turnstile y los
formularios HTML de la plataforma se comportan igual que para una persona.

## Inicio rápido

```bash
git clone https://github.com/your-org/cyberouter-bulk-creator.git
cd cyberouter-bulk-creator
npm install
npx playwright install --with-deps chromium
cp .env.example .env

# una cuenta
node src/index.mjs

# cinco cuentas, dos a la vez
node src/index.mjs -n 5 --concurrency 2
```

El resultado se escribe en `cyberouter-accounts-<timestamp>.json`:

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

| Opción | Descripción | Por defecto |
|--------|-------------|-------------|
| `-n, --count N` | número de cuentas | `1` |
| `-d, --domain D` | dominio receptor de zenvex | `souss.dev` |
| `-o, --out FILE` | archivo JSON de salida | `cyberouter-accounts-<ts>.json` |
| `-t, --timeout MS` | espera máxima del correo | `180000` |
| `--turnstile-timeout MS` | espera máxima de Cloudflare | `150000` |
| `--retries N` | reintentos por cuenta | `3` |
| `--concurrency N` | cuentas en paralelo | `1` |
| `--key-name NAME` | nombre fijo de la clave | aleatorio |
| `--proxy URL` | proxy para el navegador | ninguno |
| `--headful` | mostrar el navegador | no |
| `--keep-browser` | dejar el navegador abierto | no |
| `--doctor` | comprobar el entorno | – |
| `-q, --quiet` | solo el resumen | no |

## Configuración

Copia `.env.example` a `.env`. Las opciones de CLI anulan las variables de
entorno, que anulan los valores por defecto.

```dotenv
CYBEROUTER_DOMAIN=souss.dev
CYBEROUTER_COUNT=1
CYBEROUTER_CONCURRENCY=1
CYBEROUTER_RETRIES=3
CYBEROUTER_TIMEOUT=180000
CYBEROUTER_TURNSTILE_TIMEOUT=150000
CYBEROUTER_PROXY=
```

## Las partes difíciles (y su solución)

| Reto | Síntoma | Solución |
|------|---------|----------|
| **Turnstile en zenvex** | "Open Inbox" deshabilitado | Sondear hasta que el reto emita un token y pulsar |
| **Fallo transitorio de Turnstile** | "security check failed" | Recargar, rellenar de nuevo y reintentar |
| **Turnstile en Cyberouter** | el envío no hace nada | Esperar el token del widget antes de enviar |
| **Retraso del correo** | el código no llega | Sondeo con límite y error `mail-timeout` |
| **Código caducado** | "invalid or expired" | Se marca `code-expired` y se reintenta con otra bandeja |
| **Límites de tasa** | HTTP 429 / "too many" | Se marca `rate-limit` y se aborta (reintentar no ayuda) |
| **Fuga de proxy** | peticiones sin proxy | El proxy se aplica al contexto del navegador |

## Requisitos

- **Node.js 18+** (probado en 22)
- **Chromium** con `npx playwright install --with-deps chromium` (requiere apt)
- Una IP de salida que Cloudflare acepte. Una IP residencial o VPS limpia
  funciona mejor; los proxies gratis públicos casi nunca pasan Turnstile.

Ejecuta `node src/index.mjs --doctor` para comprobar el entorno.

## Filosofía

Este repositorio es deliberadamente mínimo:

- **Sin CI.** Sin workflows. Ejecuta `node --check` y `--doctor` en local.
- **Sin hoja de ruta.** Se aceptan issues y pull requests, pero no hay plan
  publicado.
- **Sin versiones publicadas.** La rama `main` es el proyecto.

## Preguntas frecuentes

**¿Qué dominio de zenvex funciona?**
`souss.dev` es el verificado para recibir correo de Cyberouter.

**¿Por qué un contexto de navegador por tarea?**
La bandeja temporal no debe compartir cookies con la sesión de Cyberouter.

**¿Puedo ejecutarlo sin interfaz en un servidor?**
Sí, con Chromium instalado y una IP de salida limpia. Usa `--proxy` para salida
residencial.

**¿La clave API se muestra otra vez después?**
No. Cyberouter la muestra una sola vez. Se guarda en el JSON de salida; cuida
ese archivo (está en git-ignore).

## Aviso legal

Esta herramienta automatiza un registro de terceros. Úsala solo donde estés
autorizado y conforme a los términos de Cyberouter y zenvex.dev. Los autores no
están afiliados a estos servicios y no asumen responsabilidad por el mal uso.

## Licencia

[MIT](LICENSE) © colaboradores de cyberouter-bulk-creator
