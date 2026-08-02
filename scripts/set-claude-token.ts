#!/usr/bin/env node
/**
 * Stores a Claude Code OAuth token for the deck to use.
 *
 *   claude setup-token                       # prints a token; run this yourself
 *   npm run token:claude                     # paste it when prompted
 *   npm run token:claude -- --check          # report what the deck currently resolves
 *   npm run token:claude -- --clear          # remove the stored token
 *
 * The token is written 0600 and never echoed back.
 */
import fs from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { configDir } from "../src/config.js";
import { readClaudeAccessToken, tokenFilePath } from "../src/lib/claude-auth.js";

const args = process.argv.slice(2);
const file = tokenFilePath();

if (args.includes("--help") || args.includes("-h")) {
  console.log(`Usage: npm run token:claude [-- --check | --clear]

  (no flag)  Prompt for a token and store it at ${file}
  --check    Show which source the deck resolves a token from
  --clear    Delete the stored token

Generate a token with:  claude setup-token`);
  process.exit(0);
}

if (args.includes("--clear")) {
  try {
    fs.unlinkSync(file);
    console.log(`Removed ${file}`);
  } catch {
    console.log("No stored token to remove.");
  }
  process.exit(0);
}

if (args.includes("--check")) {
  await report();
  process.exit(0);
}

if (!process.stdin.isTTY) {
  console.error(`Run this in an interactive terminal, or write the token yourself:

  install -m 600 /dev/null "${file}" && printf '%s' "<token>" > "${file}"`);
  process.exit(1);
}

const rl = createInterface({ input: process.stdin, output: process.stdout });
try {
  console.log("Generate a token in another terminal with:  claude setup-token");
  const entered = (await rl.question("Paste the token (input is stored, not echoed back): ")).trim();
  if (!entered) {
    console.error("No token entered; nothing was written.");
    process.exit(1);
  }
  if (entered.length < 20) {
    console.error("That does not look like a token; nothing was written.");
    process.exit(1);
  }

  fs.mkdirSync(configDir(), { recursive: true });
  const temporary = `${file}.tmp`;
  fs.writeFileSync(temporary, entered, { mode: 0o600 });
  fs.renameSync(temporary, file);
  fs.chmodSync(file, 0o600);
  console.log(`\nStored ${entered.length} characters at ${file} (mode 600).`);
  await report();
  console.log(`\nApply it with:  launchctl kickstart -k gui/$(id -u)/com.neo-agent-deck`);
} finally {
  rl.close();
}

async function report(): Promise<void> {
  try {
    const { source } = await readClaudeAccessToken();
    console.log(`Deck resolves a Claude token from: ${source}`);
  } catch (error) {
    console.log(`Deck finds no usable token: ${error instanceof Error ? error.message : String(error)}`);
    console.log(`Expected file: ${path.normalize(file)}`);
  }
}
