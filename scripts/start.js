#!/usr/bin/env node
/**
 * Project-local Expo starter.
 *
 * `expo start` always calls validateDependenciesVersionsAsync, which fetches
 *   https://api.expo.dev/v2/sdks/<sdk>/native-modules
 * Expo CLI only treats ENOTFOUND / EAI_AGAIN / UND_ERR_CONNECT_TIMEOUT as
 * "offline". Every other undici failure (ECONNRESET, ENETUNREACH, TLS
 * inspection, broken IPv6 on Windows) surfaces as an uncaught
 * `TypeError: fetch failed` and kills Metro after it has already started.
 *
 * This wrapper:
 *   1. Prefers IPv4 so Node 17+ does not try a dead IPv6 route first.
 *   2. Strips empty HTTP(S)_PROXY values that make undici throw Invalid URL.
 *   3. Skips the remote version check unless --validate-deps is passed.
 *   4. Forwards every other flag to the project-local Expo CLI.
 *
 * Usage:
 *   npm start
 *   npm start -- --clear
 *   npm start -- --tunnel
 *   npm run start:offline
 *   npm start -- --validate-deps
 */
"use strict";

const { spawn } = require("node:child_process");
const dns = require("node:dns");
const fs = require("node:fs");
const path = require("node:path");

const IPV4_FLAG = "--dns-result-order=ipv4first";
const PROXY_KEYS = [
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "http_proxy",
  "https_proxy",
  "ALL_PROXY",
  "all_proxy",
];

if (typeof dns.setDefaultResultOrder === "function") {
  dns.setDefaultResultOrder("ipv4first");
}

function mergeNodeOptions(existing) {
  if (existing && String(existing).includes("dns-result-order")) {
    return existing;
  }
  return [existing, IPV4_FLAG].filter(Boolean).join(" ");
}

function sanitizeProxyEnv(env) {
  const next = { ...env };
  for (const key of PROXY_KEYS) {
    if (next[key] !== undefined && String(next[key]).trim() === "") {
      delete next[key];
    }
  }
  return next;
}

function parseArgs(argv) {
  const forwarded = [];
  let validateDeps = false;

  for (const arg of argv) {
    if (arg === "--validate-deps") {
      validateDeps = true;
      continue;
    }
    forwarded.push(arg);
  }

  return { forwarded, validateDeps };
}

function resolveExpoCli(projectRoot) {
  const candidates = [
    path.join(projectRoot, "node_modules", "expo", "bin", "cli"),
    path.join(projectRoot, "node_modules", "expo", "bin", "cli.js"),
  ];
  return candidates.find((file) => fs.existsSync(file)) ?? null;
}

function main() {
  const projectRoot = path.resolve(__dirname, "..");
  const expoCli = resolveExpoCli(projectRoot);

  if (!expoCli) {
    console.error(
      "Could not find the project-local Expo CLI.\n" +
        "Run `npm ci` from the project root, then retry `npm start`."
    );
    process.exit(1);
  }

  const { forwarded, validateDeps } = parseArgs(process.argv.slice(2));
  const forceOffline = forwarded.includes("--offline");

  const env = sanitizeProxyEnv({
    ...process.env,
    NODE_OPTIONS: mergeNodeOptions(process.env.NODE_OPTIONS),
  });

  // Skip the remote bundled-native-modules fetch that crashes Expo CLI when
  // api.expo.dev is filtered, reset, or reached over a broken IPv6 path.
  // `npx expo-doctor` and `npm start -- --validate-deps` still run the check.
  if (!validateDeps && env.EXPO_NO_DEPENDENCY_VALIDATION == null) {
    env.EXPO_NO_DEPENDENCY_VALIDATION = "1";
    if (!forceOffline) {
      console.log(
        "Skipping Expo's remote dependency check (avoids TypeError: fetch failed on api.expo.dev).\n" +
          "Re-enable with `npm start -- --validate-deps`. Fully offline: `npm run start:offline`.\n"
      );
    }
  }

  const child = spawn(process.execPath, [expoCli, "start", ...forwarded], {
    cwd: projectRoot,
    env,
    stdio: "inherit",
    windowsHide: true,
  });

  const forwardSignal = (signal) => {
    if (!child.killed) {
      child.kill(signal);
    }
  };
  process.on("SIGINT", () => forwardSignal("SIGINT"));
  process.on("SIGTERM", () => forwardSignal("SIGTERM"));

  child.on("error", (error) => {
    console.error("Failed to launch Expo CLI:", error.message);
    process.exit(1);
  });

  child.on("exit", (code, signal) => {
    if (signal) {
      process.exit(1);
      return;
    }
    process.exit(code ?? 0);
  });
}

main();
