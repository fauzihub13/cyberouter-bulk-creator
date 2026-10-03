/**
 * Random data generators for account provisioning.
 * Every identifier is drawn from `node:crypto`, never Math.random.
 *
 * @module utils/random
 */

import { randomInt } from "node:crypto";

/** Pick a random element from an array. */
export function pick(arr) {
  return arr[randomInt(arr.length)];
}

/** Random integer in [0, max). */
export function randInt(max) {
  return randomInt(max);
}

/** Shuffle a string's characters in place (Fisher–Yates). */
function shuffle(str) {
  const a = str.split("");
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.join("");
}

const EMAIL_A = [
  "swift", "calm", "bright", "north", "lunar", "ember", "quiet", "vivid",
  "amber", "solar", "frost", "river", "delta", "noble", "crisp", "zesty",
  "misty", "brave", "silent", "rapid", "azure", "coral", "jade", "onyx",
];

const EMAIL_B = [
  "fox", "lynx", "orbit", "pixel", "cedar", "comet", "harbor", "falcon",
  "willow", "quartz", "raven", "maple", "otter", "badger", "heron", "finch",
  "koala", "puma", "wren", "bison", "wolf", "hawk", "kite", "moth",
];

const KEY_ADJ = [
  "prod", "dev", "test", "main", "alpha", "beta", "edge", "core", "data",
  "web", "app", "cli", "ml", "ops", "tool", "lab", "staging", "nightly",
];

const KEY_NOUN = [
  "key", "token", "access", "secret", "agent", "bot", "script", "worker",
  "bridge", "gateway", "runner", "client",
];

/** A random email local-part, e.g. "swiftfox482913". */
export function randomEmailLocal() {
  return `${pick(EMAIL_A)}${pick(EMAIL_B)}${randInt(900000) + 100000}`;
}

/** A random API-key label, e.g. "prod-token-7421". */
export function randomKeyName() {
  return `${pick(KEY_ADJ)}-${pick(KEY_NOUN)}-${randInt(9000) + 1000}`;
}
