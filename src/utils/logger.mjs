/**
 * Structured logger with 256-colour ANSI output, level badges and icons.
 * Zero dependencies. Falls back to plain text when colour is disabled
 * (non-TTY or NO_COLOR).
 *
 * @module utils/logger
 */

const useColor = process.stdout.isTTY && !process.env.NO_COLOR;

/** Wrap `s` in a raw ANSI escape sequence when colour is enabled. */
const c = (code) => (s) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : String(s));

export const color = {
  reset: c(0),
  bold: c(1),
  dim: c(2),
  italic: c(3),
  underline: c(4),
  gray: c("38;5;244"),
  red: c("38;5;203"),
  green: c("38;5;114"),
  yellow: c("38;5;221"),
  orange: c("38;5;215"),
  blue: c("38;5;75"),
  cyan: c("38;5;80"),
  magenta: c("38;5;176"),
  violet: c("38;5;141"),
  white: c("38;5;255"),
  // Backgrounds for badges.
  bgBlue: c("48;5;24"),
  bgGreen: c("48;5;28"),
  bgYellow: c("48;5;94"),
  bgRed: c("48;5;88"),
  bgGray: c("48;5;238"),
};

/** ISO timestamp without millisecond noise. */
function ts() {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}

const clock = () => color.gray(ts());

/** A coloured badge like ` INFO ` with a background. */
function badge(text, bg, fg = color.white) {
  const body = bg(color.bold(` ${text} `));
  return useColor ? body : `[${text}]`;
}

const TAGS = {
  info: () => badge("INFO", color.bgBlue, color.white),
  step: () => badge("STEP", color.bgGray, color.cyan),
  ok: () => badge(" OK ", color.bgGreen, color.white),
  warn: () => badge("WARN", color.bgYellow, color.white),
  error: () => badge("ERR ", color.bgRed, color.white),
};

const ICONS = {
  info: color.cyan("›"),
  step: color.violet("◆"),
  ok: color.green("✔"),
  warn: color.yellow("▲"),
  error: color.red("✘"),
};

function emit(level, msg, { indent = 2 } = {}) {
  const line = `${clock()} ${TAGS[level]()} ${ICONS[level]} ${" ".repeat(indent)}${msg}`;
  process.stdout.write(`${line}\n`);
}

/** Render `key=value` pairs with dimmed keys and coloured values. */
function pairs(obj) {
  return Object.entries(obj)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${color.dim(`${k}=`)}${color.white(v)}`)
    .join(color.dim("  "));
}

export const log = {
  info: (m) => emit("info", m),
  step: (m) => emit("step", m),
  ok: (m) => emit("ok", m),
  warn: (m) => emit("warn", m),
  error: (m) => emit("error", m),

  /** Print raw text (no badge). */
  raw: (m) => process.stdout.write(`${m}\n`),

  /** A block of `key=value` pairs on one INFO line, e.g. log.kv({accounts:1}). */
  kv: (obj) => emit("info", pairs(obj)),

  /** A prominent section header for each account. */
  section: (title) => {
    const bar = color.violet("━".repeat(Math.max(6, 56 - title.length)));
    process.stdout.write(`\n${color.violet("┏")} ${color.bold(color.violet(title))} ${bar}\n`);
  },

  /** A dimmed divider line. */
  divider: () => process.stdout.write(color.gray("─".repeat(64)) + "\n"),

  /** A framed summary line. */
  banner: (text) => {
    const line = color.gray("═".repeat(64));
    process.stdout.write(`${line}\n${color.bold(text)}\n${line}\n`);
  },

  /** A success line highlighted green (for final result rows). */
  success: (m) => process.stdout.write(`${color.green("✔")} ${m}\n`),

  /** A failure line highlighted red. */
  failure: (m) => process.stdout.write(`${color.red("✘")} ${m}\n`),
};

export default log;
