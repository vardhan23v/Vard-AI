/** Browser agent types shared by the harness, CLI and app (through protocol.ts). No Node imports. */
import { z } from "zod";

export const VIEWPORTS = {
  mobile: { width: 375, height: 812, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  "mobile-large": { width: 430, height: 932, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  tablet: { width: 768, height: 1024, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  laptop: { width: 1366, height: 768, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
  desktop: { width: 1920, height: 1080, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
} as const;
export type ViewportName = keyof typeof VIEWPORTS;
export const ViewportName = z.enum(["mobile", "mobile-large", "tablet", "laptop", "desktop"]);
export const Viewport = z.object({
  width: z.number().int().min(200).max(4000),
  height: z.number().int().min(200).max(4000),
  deviceScaleFactor: z.number().min(1).max(4).default(1),
  isMobile: z.boolean().default(false),
  hasTouch: z.boolean().default(false),
});
export type Viewport = z.infer<typeof Viewport>;

export const BrowserInstall = z.object({
  installed: z.boolean(),
  executable: z.string().optional(),
  /** Where it came from: Playwright's cache, an app in /Applications, or $VARD_CHROMIUM. */
  source: z.enum(["playwright", "system", "env"]).optional(),
  name: z.string().optional(),
  version: z.string().optional(),
  /** What Install would download. */
  installable: z.object({ name: z.string(), version: z.string(), url: z.string(), approxMB: z.number() }).optional(),
});
export type BrowserInstall = z.infer<typeof BrowserInstall>;

export const ConsoleEntry = z.object({
  type: z.enum(["error", "warning", "pageerror", "info"]),
  text: z.string(),
  url: z.string().optional(),
  line: z.number().optional(),
  at: z.number(),
});
export type ConsoleEntry = z.infer<typeof ConsoleEntry>;

export const NetworkEntry = z.object({
  kind: z.enum(["failed", "http_error", "blocked"]),
  method: z.string(),
  url: z.string(),
  status: z.number().optional(),
  error: z.string().optional(),
  resource: z.string().optional(),
  at: z.number(),
});
export type NetworkEntry = z.infer<typeof NetworkEntry>;

export const Finding = z.object({
  viewport: z.string(),
  severity: z.enum(["high", "medium", "low"]),
  kind: z.enum(["horizontal_overflow", "clipped_text", "offscreen", "overlap", "small_target", "unlabeled_field", "hidden_navigation", "console_error", "network_error", "broken_image"]),
  message: z.string(),
  selector: z.string().optional(),
  evidence: z.string(),
  screenshot: z.string().optional(),
});
export type Finding = z.infer<typeof Finding>;

export const Screenshot = z.object({
  path: z.string(),
  label: z.string(),
  viewport: z.string().optional(),
  width: z.number(),
  height: z.number(),
  at: z.number(),
});
export type Screenshot = z.infer<typeof Screenshot>;

export const BrowserReport = z.object({
  url: z.string(),
  viewports: z.array(z.string()),
  findings: z.array(Finding),
  screenshots: z.array(Screenshot),
  console: z.array(ConsoleEntry),
  network: z.array(NetworkEntry),
  summary: z.string(),
  reportPath: z.string().optional(),
  at: z.number(),
});
export type BrowserReport = z.infer<typeof BrowserReport>;

export const BrowserSessionInfo = z.object({
  id: z.string(),
  taskId: z.string().optional(),
  agentId: z.string().optional(),
  state: z.enum(["starting", "ready", "busy", "crashed", "closed"]),
  url: z.string().optional(),
  title: z.string().optional(),
  viewport: z.object({ name: z.string(), width: z.number(), height: z.number() }),
  tabs: z.number(),
  consoleErrors: z.number(),
  networkErrors: z.number(),
  screenshots: z.array(Screenshot),
  artifactsDir: z.string(),
  startedAt: z.number(),
  lastAction: z.string().optional(),
  /** The latest console and network problems (redacted), for the UI. */
  recentConsole: z.array(ConsoleEntry).optional(),
  recentNetwork: z.array(NetworkEntry).optional(),
});
export type BrowserSessionInfo = z.infer<typeof BrowserSessionInfo>;

export const DevServerInfo = z.object({
  id: z.string(),
  taskId: z.string().optional(),
  command: z.string(),
  cwd: z.string(),
  url: z.string(),
  port: z.number(),
  state: z.enum(["starting", "ready", "failed", "stopped"]),
  log: z.array(z.string()),
  error: z.string().optional(),
});
export type DevServerInfo = z.infer<typeof DevServerInfo>;
