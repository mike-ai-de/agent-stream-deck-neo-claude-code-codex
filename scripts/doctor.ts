#!/usr/bin/env node
import fs from "node:fs";
import { DeviceModelId, listStreamDecks } from "@elgato-stream-deck/node";
import { Dashboard } from "../src/dashboard.js";
import { claudeSessionsDirectory, codexSessionsDirectory, platformLabel } from "../src/platform.js";

console.log(`Platform: ${platformLabel()} · Node ${process.version}`);
try {
  const devices = await listStreamDecks();
  const neo = devices.find((device) => device.model === DeviceModelId.NEO);
  console.log(`${neo ? "✓" : "○"} Stream Deck Neo ${neo ? "detected" : "not connected; service will wait"}`);
} catch (error) {
  console.log(`✗ Stream Deck USB scan failed: ${error instanceof Error ? error.message : String(error)}`);
}

console.log(`${fs.existsSync(claudeSessionsDirectory()) ? "✓" : "✗"} Claude Code session data available`);
console.log(`${fs.existsSync(codexSessionsDirectory()) ? "✓" : "✗"} Codex session data available`);

try {
  const snapshot = await new Dashboard().collect();
  for (const provider of Object.values(snapshot.providers)) {
    const healthy = !provider.usage.error;
    console.log(`${healthy ? "✓" : "✗"} ${provider.provider} backend ${healthy ? "readable" : provider.usage.error}`);
  }
} catch (error) {
  console.log(`✗ Backend collection failed: ${error instanceof Error ? error.message : String(error)}`);
}
