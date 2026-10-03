<div align="center">

<img src="docs/assets/banner.svg" alt="cyberouter-bulk-creator" width="720">

# cyberouter-bulk-creator

**Aprovisionamiento masivo y de extremo a extremo de cuentas y claves API de [Cyberouter](https://router.enclave.ai) (router.enclave.ai), verificado con bandejas temporales de [BlipMail](https://blipmail.mpruy.my.id), con el reto Cloudflare Turnstile resuelto por [CapSolver](https://capsolver.com).**

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

1. Crea un correo temporal nuevo en **BlipMail** (vía su API JSON).
2. Resuelve el Cloudflare Turnstile de Cyberouter con **CapSolver**.
3. Solicita un código de acceso a **Cyberouter**.
4. Lee el código del correo en la bandeja temporal.
5. Inicia sesión y crea una **clave API `sk-cyberouter_...`**.
6. Guarda todo en un archivo JSON.

Ejecuta el flujo real del navegador de Cyberouter con Playwright, por lo que las
cookies, los tokens CSRF y los formularios HTML POST se comportan igual que para
una persona; solo el token de Turnstile se obtiene fuera del navegador, porque el
widget es diferido y nunca se completa en un navegador automatizado.

## Inicio rápido

```bash
git clone https://github.com/your-org/cyberouter-bulk-creator.git
cd cyberouter-bulk-creator
npm install
npx playwright install --with-deps chromium
cp .env.example .env
# luego define CAPSOLVER_KEY en .env (https://dashboard.capsolver.com)

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
    "email": "langitbiru23@mpruy.my.id",
    "api_key": "sk-cyberouter_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    "key_name": "prod-token-7421",
    "email_provider": "BlipMail (mpruy.my.id)",
    "elapsed_ms": 19579,
    "created_at": "2026-10-03T00:00:00.000Z"
  }
]
```

Las cuentas exitosas también se añaden, a medida que se crean, a dos archivos
persistentes (ambos en git-ignore):

`results.json` — un array JSON creciente de objetos de cuenta exitosa:

```json
[
  {
    "email": "langitbiru23@mpruy.my.id",
    "api_key": "sk-cyberouter_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    "key_name": "prod-token-7421",
    "email_provider": "BlipMail (mpruy.my.id)",
    "created_at": "2026-10-03T00:00:00.000Z"
  }
]
```

`results.txt` — una línea `email|api_key` por éxito:

```
langitbiru23@mpruy.my.id|sk-cyberouter_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

## CLI

| Opción | Descripción | Por defecto |
|--------|-------------|-------------|
| `-n, --count N` | número de cuentas | `1` |
| `-d, --domain D` | dominio receptor de blipmail | por defecto de blipmail |
| `-o, --out FILE` | archivo JSON de salida | `cyberouter-accounts-<ts>.json` |
| `--results-json FILE` | añadir cuentas exitosas (array JSON) | `results.json` |
| `--results-txt FILE` | añadir `email|api_key` por éxito | `results.txt` |
| `-t, --timeout MS` | espera máxima del correo | `180000` |
| `--turnstile-timeout MS` | espera máxima de CapSolver | `120000` |
| `--retries N` | reintentos por cuenta | `3` |
| `--concurrency N` | cuentas en paralelo | `1` |
| `--key-name NAME` | nombre fijo de la clave | aleatorio |
| `--capsolver-key KEY` | clave API de CapSolver | `CAPSOLVER_KEY` |
| `--proxy URL` | proxy para navegador y API | ninguno |
| `--headful` | mostrar el navegador | no |
| `--keep-browser` | dejar el navegador abierto | no |
| `--doctor` | comprobar el entorno | – |
| `-q, --quiet` | solo el resumen | no |

## Configuración

Copia `.env.example` a `.env`. Las opciones de CLI anulan las variables de
entorno, que anulan los valores por defecto.

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

## Las partes difíciles (y su solución)

| Reto | Síntoma | Solución |
|------|---------|----------|
| **Turnstile en Cyberouter** | el widget `execute` diferido nunca se resuelve; el envío no hace nada | CapSolver lo resuelve y el token se inyecta en `cf-turnstile-response` |
| **Momento del envío** | el contexto se destruye al enviar | Enviar en el siguiente tick para que el evaluate de inyección termine antes |
| **Retraso del correo** | el código no llega | Sondeo con límite a la API de BlipMail con error `mail-timeout` |
| **Código caducado** | "invalid or expired" | Se marca `code-expired` y se reintenta con otra bandeja |
| **Límites de tasa** | HTTP 429 / "too many" | Se marca `rate-limit` y se aborta (reintentar no ayuda) |
| **Fuga de proxy** | peticiones sin proxy | El proxy se aplica al contexto del navegador; la API de la bandeja lo comparte |

## Requisitos

- **Node.js 18+** (probado en 24)
- **Chromium** con `npx playwright install --with-deps chromium` (requiere apt)
- Una **clave API de CapSolver** con saldo — resuelve el reto Turnstile.
- Una IP de salida que Cloudflare acepte. Una IP residencial o VPS limpia
  funciona mejor.

Ejecuta `node src/index.mjs --doctor` para comprobar el entorno.

## Filosofía

Este repositorio es deliberadamente mínimo:

- **Sin CI.** Sin workflows. Ejecuta `node --check` y `--doctor` en local.
- **Sin hoja de ruta.** Se aceptan issues y pull requests, pero no hay plan
  publicado.
- **Sin versiones publicadas.** La rama `main` es el proyecto.

## Preguntas frecuentes

**¿Qué dominio de blipmail funciona?**
Cualquiera de los dominios receptores activos de BlipMail; el correo de
Cyberouter llega al que asigne el servicio. Fija uno con `-d`/`--domain` solo si
lo necesitas.

**¿Por qué dos contextos para una misma tarea?**
La sesión de Cyberouter y la API de BlipMail están aisladas: la API de la
bandeja se ejecuta mediante un `APIRequestContext` de Playwright que comparte el
proxy de salida pero no las cookies de Cyberouter. Por eso `--concurrency` crea
contextos de plataforma separados.

**¿Puedo ejecutarlo sin interfaz en un servidor?**
Sí. CapSolver resuelve Turnstile, así que no hace falta un navegador interactivo.

**¿La clave API se muestra otra vez después?**
No. Cyberouter la muestra una sola vez. Se guarda en el JSON de salida; cuida
ese archivo (está en git-ignore).

## Aviso legal

Esta herramienta automatiza un registro de terceros. Úsala solo donde estés
autorizado y conforme a los términos de Cyberouter, BlipMail y CapSolver.
Los autores no están afiliados a estos servicios y no asumen responsabilidad por
el mal uso.

## Licencia

[MIT](LICENSE) © colaboradores de cyberouter-bulk-creator
