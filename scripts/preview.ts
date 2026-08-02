#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { DEFAULT_CONFIG, loadConfig } from "../src/config.js";
import { Dashboard, groupProjects, rankSessions, summarizeProvider } from "../src/dashboard.js";
import { renderDeckBuffers, renderProviderKey } from "../src/render.js";
import type { DashboardSnapshot, Provider, SessionSnapshot, UsageSnapshot } from "../src/types.js";

interface PositionedOverlay {
  input: Buffer;
  left: number;
  top: number;
}

const args = process.argv.slice(2);
const live = args.includes("--live");
const readme = args.includes("--readme");
const outputArg = args.find((argument) => !argument.startsWith("--"));
const defaultOutput = live ? path.join(os.tmpdir(), "neo-agent-deck-live.png") : "docs/neo-agent-deck-preview.png";
const output = path.resolve(outputArg || defaultOutput);
const snapshot = live ? await new Dashboard().collect() : sampleSnapshot();
// A live preview should show the deck you actually have. The documentation images stay on the
// default layout, since that is what a new reader is being shown.
const previewConfig = live ? loadConfig() : DEFAULT_CONFIG;

if (readme) {
  const images = path.resolve("docs/images");
  const heroOutput = path.join(images, "hero.png");
  const statusOutput = path.join(images, "status-states.png");
  const infoBarOutput = path.join(images, "infobar-pages.png");
  await writeHero(snapshot, heroOutput);
  await writeStatusGallery(snapshot, statusOutput);
  await writeInfoBarGallery(snapshot, infoBarOutput);
  console.log(heroOutput);
  console.log(statusOutput);
  console.log(infoBarOutput);
} else {
  await writeDeckPreview(snapshot, Math.max(0, previewConfig.infoBar.indexOf(previewConfig.restingPage)), output);
  console.log(output);
}

async function writeHero(data: DashboardSnapshot, file: string): Promise<void> {
  const width = 1600;
  const height = 900;
  const device = await renderDevice(data, DEFAULT_CONFIG.infoBar.indexOf("all"), 1.14);
  const background = svg(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#070a12"/>
          <stop offset="0.58" stop-color="#101526"/>
          <stop offset="1" stop-color="#071018"/>
        </linearGradient>
        <radialGradient id="blue" cx="50%" cy="50%" r="50%">
          <stop offset="0" stop-color="#38bdf8" stop-opacity=".16"/>
          <stop offset="1" stop-color="#38bdf8" stop-opacity="0"/>
        </radialGradient>
        <radialGradient id="violet" cx="50%" cy="50%" r="50%">
          <stop offset="0" stop-color="#a78bfa" stop-opacity=".17"/>
          <stop offset="1" stop-color="#a78bfa" stop-opacity="0"/>
        </radialGradient>
        <linearGradient id="line" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="#38bdf8"/>
          <stop offset="1" stop-color="#a78bfa"/>
        </linearGradient>
      </defs>
      <rect width="1600" height="900" fill="url(#bg)"/>
      <ellipse cx="1270" cy="230" rx="600" ry="490" fill="url(#violet)"/>
      <ellipse cx="910" cy="880" rx="850" ry="380" fill="url(#blue)"/>
      <g opacity=".10" stroke="#9fb0c7" stroke-width="1">
        <path d="M80 0 V900"/><path d="M200 0 V900"/><path d="M320 0 V900"/><path d="M440 0 V900"/>
        <path d="M560 0 V900"/><path d="M680 0 V900"/><path d="M800 0 V900"/><path d="M920 0 V900"/>
        <path d="M1040 0 V900"/><path d="M1160 0 V900"/><path d="M1280 0 V900"/><path d="M1400 0 V900"/><path d="M1520 0 V900"/>
        <path d="M0 80 H1600"/><path d="M0 160 H1600"/><path d="M0 240 H1600"/><path d="M0 320 H1600"/>
        <path d="M0 400 H1600"/><path d="M0 480 H1600"/><path d="M0 560 H1600"/><path d="M0 640 H1600"/>
        <path d="M0 720 H1600"/><path d="M0 800 H1600"/><path d="M0 880 H1600"/>
      </g>
      <rect x="80" y="80" width="1440" height="1" fill="#ffffff" fill-opacity=".10"/>
      <rect x="80" y="79" width="72" height="3" rx="1.5" fill="url(#line)"/>
      <text x="80" y="126" fill="#c4cfde" font-family="Arial,sans-serif" font-size="18" font-weight="700" letter-spacing="3.2">AGENT STREAM DECK NEO</text>
      <text x="1520" y="125" text-anchor="end" fill="#65758c" font-family="Arial,sans-serif" font-size="14" font-weight="700" letter-spacing="2">STREAM DECK NEO · LOCAL USB</text>
      <text x="80" y="246" fill="#f8fafc" font-family="Arial,sans-serif" font-size="68" font-weight="800">
        <tspan x="80" dy="0">Every agent.</tspan><tspan x="80" dy="76">One glance.</tspan>
      </text>
      <text x="84" y="432" fill="#9eacc0" font-family="Arial,sans-serif" font-size="23">
        <tspan x="84" dy="0">Claude Code and Codex.</tspan>
        <tspan x="84" dy="36">Live status and usage on your desk.</tspan>
      </text>
      <g transform="translate(80 544)">
        <rect width="432" height="56" rx="12" fill="#0f1728" stroke="#ffffff" stroke-opacity=".13"/>
        <circle cx="28" cy="28" r="6" fill="#34d399"/>
        <text x="50" y="35" fill="#d1d9e6" font-family="Arial,sans-serif" font-size="16" font-weight="700" letter-spacing="1.8">LOCAL  ·  PRIVATE  ·  LIVE</text>
      </g>
      <g transform="translate(80 692)" font-family="Arial,sans-serif">
        <text x="0" y="0" fill="#f59e67" font-size="12" font-weight="800" letter-spacing="1.6">CLAUDE</text>
        <text x="0" y="28" fill="#6f7e94" font-size="14">session focus</text>
        <text x="144" y="0" fill="#55b7ff" font-size="12" font-weight="800" letter-spacing="1.6">CODEX</text>
        <text x="144" y="28" fill="#6f7e94" font-size="14">rate limits</text>
      </g>
      <rect x="80" y="800" width="1440" height="1" fill="#ffffff" fill-opacity=".10"/>
      <text x="80" y="842" fill="#617087" font-family="Arial,sans-serif" font-size="14" font-weight="700" letter-spacing="1.6">STATUS · USAGE · ATTENTION</text>
      <text x="1520" y="842" text-anchor="end" fill="#617087" font-family="Arial,sans-serif" font-size="14" letter-spacing="1.4">OPEN SOURCE · NO TELEMETRY</text>
    </svg>`);

  await writePng(
    width,
    height,
    background,
    [{ input: device, left: 568, top: 114 }],
    file
  );
}

async function writeStatusGallery(data: DashboardSnapshot, file: string): Promise<void> {
  const width = 1400;
  const height = 760;
  const keys = await Promise.all([
    renderProviderKey({ ...data.providers.claude, state: "working", workingCount: 1 }),
    renderProviderKey({ ...data.providers.codex, state: "attention", attentionCount: 1 }),
    renderProviderKey({ ...data.providers.claude, state: "idle", openCount: 0, workingCount: 0, attentionCount: 0 })
  ].map(async (buffer) => rawKeyToPng(await buffer, 2.2)));
  const background = svg(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#080b14"/><stop offset=".55" stop-color="#111629"/><stop offset="1" stop-color="#08121a"/>
        </linearGradient>
        <radialGradient id="glow"><stop offset="0" stop-color="#7c3aed" stop-opacity=".16"/><stop offset="1" stop-color="#7c3aed" stop-opacity="0"/></radialGradient>
      </defs>
      <rect width="1400" height="760" fill="url(#bg)"/>
      <ellipse cx="700" cy="620" rx="700" ry="350" fill="url(#glow)"/>
      <text x="700" y="92" text-anchor="middle" fill="#f8fafc" font-family="Arial,sans-serif" font-size="42" font-weight="800">Know what needs you.</text>
      <text x="700" y="137" text-anchor="middle" fill="#8492a7" font-family="Arial,sans-serif" font-size="20">Three states. One unmistakable signal.</text>
      <g fill="none" stroke="#ffffff" stroke-opacity=".09"><rect x="112" y="202" width="354" height="422" rx="34"/><rect x="523" y="202" width="354" height="422" rx="34"/><rect x="934" y="202" width="354" height="422" rx="34"/></g>
      <g font-family="Arial,sans-serif" text-anchor="middle">
        <text x="289" y="488" fill="#34d399" font-size="20" font-weight="800" letter-spacing="2.5">WORKING</text>
        <text x="289" y="526" fill="#cbd5e1" font-size="17">An agent is actively processing.</text>
        <text x="700" y="488" fill="#ffb020" font-size="20" font-weight="800" letter-spacing="2.5">NEED YOU</text>
        <text x="700" y="526" fill="#cbd5e1" font-size="17">A completed turn awaits attention.</text>
        <text x="1111" y="488" fill="#91a0b5" font-size="20" font-weight="800" letter-spacing="2.5">IDLE</text>
        <text x="1111" y="526" fill="#cbd5e1" font-size="17">No active or unacknowledged work.</text>
      </g>
      <g fill="#69778d" font-family="Arial,sans-serif" font-size="14" text-anchor="middle" letter-spacing="1.2">
        <text x="289" y="578">LIVE BACKEND STATE</text><text x="700" y="578">TAP TO ACKNOWLEDGE</text><text x="1111" y="578">READY WHEN YOU ARE</text>
      </g>
    </svg>`);
  const positions = [183, 594, 1005];
  const composites = keys.map((input, index) => ({ input, left: positions[index], top: 245 }));
  await writePng(width, height, background, composites, file);
}

async function writeInfoBarGallery(data: DashboardSnapshot, file: string): Promise<void> {
  const width = 1400;
  const height = 820;
  const names = ["SESSIONS", "CODEX", "ALL AGENTS"];
  const descriptions = ["NAMED LIVE SESSIONS", "RATE-LIMIT WINDOWS", "OPEN + WORK + NEED YOU"];
  const bars: Buffer[] = [];
  for (let page = 0; page < DEFAULT_CONFIG.infoBar.length; page += 1) {
    const buffers = await renderDeckBuffers(data, page, DEFAULT_CONFIG);
    bars.push(await rawInfoBarToPng(buffers[8], 1.75));
  }
  const background = svg(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#070a12"/><stop offset=".5" stop-color="#12172a"/><stop offset="1" stop-color="#081017"/></linearGradient>
        <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0"><stop stop-color="#f59e67"/><stop offset=".55" stop-color="#55b7ff"/><stop offset="1" stop-color="#34d399"/></linearGradient>
      </defs>
      <rect width="1400" height="820" fill="url(#bg)"/>
      <rect x="560" y="80" width="280" height="5" rx="2.5" fill="url(#accent)"/>
      <text x="700" y="142" text-anchor="middle" fill="#f8fafc" font-family="Arial,sans-serif" font-size="42" font-weight="800">One InfoBar. Three live views.</text>
      <text x="700" y="185" text-anchor="middle" fill="#8492a7" font-family="Arial,sans-serif" font-size="19">Cycle with the info key or Neo touch points.</text>
      <g fill="#ffffff" fill-opacity=".035" stroke="#ffffff" stroke-opacity=".09">
        <rect x="30" y="242" width="434" height="250" rx="28"/><rect x="483" y="242" width="434" height="250" rx="28"/><rect x="936" y="242" width="434" height="250" rx="28"/>
      </g>
      <g font-family="Arial,sans-serif">
        ${names.map((name, index) => {
          const left = 60 + index * 453;
          const top = 286;
          return `<text x="${left}" y="${top}" fill="#f1f5f9" font-size="18" font-weight="800" letter-spacing="1.6">${name}</text><text x="${left}" y="${top + 27}" fill="#66758c" font-size="12" font-weight="700" letter-spacing="1.1">${descriptions[index]}</text>`;
        }).join("")}
      </g>
    </svg>`);
  const positions = [
    { left: 30, top: 342 }, { left: 483, top: 342 }, { left: 936, top: 342 }
  ];
  const composites = bars.map((input, index) => ({ input, ...positions[index] }));
  await writePng(width, height, background, composites, file);
}

async function writeDeckPreview(data: DashboardSnapshot, page: number, file: string): Promise<void> {
  const device = await renderDevice(data, page, 1);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  await sharp(device).png().toFile(file);
}

async function renderDevice(data: DashboardSnapshot, page: number, scale: number): Promise<Buffer> {
  // previewConfig is DEFAULT_CONFIG outside --live, so the documentation renders are unaffected.
  const buffers = await renderDeckBuffers(data, page, previewConfig);
  const keySize = 134;
  const gap = 22;
  const keys = await Promise.all(buffers.slice(0, 8).map((buffer) => rawKeyToPng(buffer, keySize / 96)));
  const infoBar = await rawInfoBarToPng(buffers[8], 1.55);
  const shell = svg(`
    <svg xmlns="http://www.w3.org/2000/svg" width="840" height="624">
      <defs>
        <linearGradient id="body" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#2b303b"/><stop offset=".13" stop-color="#161a22"/><stop offset="1" stop-color="#080a0f"/></linearGradient>
        <linearGradient id="edge" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#64748b" stop-opacity=".42"/><stop offset=".4" stop-color="#ffffff" stop-opacity=".05"/><stop offset="1" stop-color="#020308"/></linearGradient>
        <filter id="shadow" x="-20%" y="-20%" width="140%" height="160%"><feGaussianBlur stdDeviation="22"/></filter>
      </defs>
      <ellipse cx="420" cy="567" rx="370" ry="40" fill="#000" opacity=".62" filter="url(#shadow)"/>
      <rect x="38" y="26" width="764" height="548" rx="54" fill="url(#edge)"/>
      <rect x="40" y="28" width="760" height="544" rx="52" fill="url(#body)"/>
      <rect x="48" y="36" width="744" height="528" rx="46" fill="none" stroke="#ffffff" stroke-opacity=".08"/>
      <text x="420" y="548" text-anchor="middle" fill="#5e6878" font-family="Arial,sans-serif" font-size="11" font-weight="700" letter-spacing="3">STREAM DECK NEO</text>
      <g fill="#aab5c6"><path d="M116 473 l10 -10 l4 4 l-6 6 l6 6 l-4 4z"/><path d="M714 473 l-10 -10 l-4 4 l6 6 l-6 6 l4 4z"/></g>
      <g fill="none" stroke="#ffffff" stroke-opacity=".08"><circle cx="123" cy="473" r="28"/><circle cx="707" cy="473" r="28"/></g>
    </svg>`);
  const keyGridWidth = 4 * keySize + 3 * gap;
  const keyGridLeft = Math.round((840 - keyGridWidth) / 2);
  const composites: PositionedOverlay[] = keys.map((input, index) => ({
    input,
    left: keyGridLeft + (index % 4) * (keySize + gap),
    top: 67 + Math.floor(index / 4) * (keySize + gap)
  }));
  composites.push({ input: infoBar, left: 228, top: 428 });
  const device = await sharp(shell).composite(composites).png().toBuffer();
  if (scale === 1) return device;
  return sharp(device).resize(Math.round(840 * scale), Math.round(624 * scale)).png().toBuffer();
}

async function rawKeyToPng(buffer: Buffer, scale: number): Promise<Buffer> {
  return sharp(buffer, { raw: { width: 96, height: 96, channels: 4 } }).resize(Math.round(96 * scale), Math.round(96 * scale)).png().toBuffer();
}

async function rawInfoBarToPng(buffer: Buffer, scale: number): Promise<Buffer> {
  return sharp(buffer, { raw: { width: 248, height: 58, channels: 4 } }).resize(Math.round(248 * scale), Math.round(58 * scale)).png().toBuffer();
}

async function writePng(width: number, height: number, background: Buffer, composites: PositionedOverlay[], file: string): Promise<void> {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  await sharp({ create: { width, height, channels: 4, background: "#070912" } })
    .composite([{ input: background, left: 0, top: 0 }, ...composites])
    .flatten({ background: "#070912" })
    .removeAlpha()
    .png({ compressionLevel: 9 })
    .toFile(file);
}

function svg(markup: string): Buffer {
  return Buffer.from(markup);
}

function sampleSnapshot(): DashboardSnapshot {
  const session = (provider: Provider, id: string, state: SessionSnapshot["state"], isOpen = state !== "idle"): SessionSnapshot => ({
    key: `${provider}:${id}`,
    id,
    provider,
    state,
    isOpen,
    activityAt: Date.now(),
    completionAt: state === "attention" ? Date.now() : 0,
    label: { claude: "SaleSync", codex: "SaleSync" }[provider]
  });
  const claudeUsage: UsageSnapshot = { provider: "claude", windows: [], updatedAt: Date.now(), error: null };
  const codexUsage: UsageSnapshot = { provider: "codex", windows: [{ label: "5h", percent: 17, resetsAt: null }, { label: "1w", percent: 25, resetsAt: null }], updatedAt: Date.now(), error: null };
  const providers = {
    claude: summarizeProvider("claude", { sessions: [session("claude", "1", "working"), session("claude", "2", "idle", true)], usage: claudeUsage }),
    codex: summarizeProvider("codex", { sessions: [session("codex", "1", "attention"), session("codex", "2", "idle")], usage: codexUsage })
  };
  const all = Object.values(providers).flatMap((provider) => provider.sessions);
  return { providers, openCount: all.filter((item) => item.isOpen).length, workingCount: all.filter((item) => item.state === "working").length, attentionCount: all.filter((item) => item.state === "attention").length, updatedAt: Date.now(), ranked: rankSessions(all), projects: groupProjects(rankSessions(all)) };
}
