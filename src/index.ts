#!/usr/bin/env node
import { OscaNeo } from "./osca/app.js";

const app = new OscaNeo();

async function shutdown(signal: string): Promise<void> {
  console.log(`Received ${signal}; stopping Neo Agent Deck.`);
  await app.stop();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

app.start().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
