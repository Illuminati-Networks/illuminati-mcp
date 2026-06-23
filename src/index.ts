#!/usr/bin/env node
/**
 * Illuminati Networks MCP server.
 *
 * Exposes the platform (CDN/object storage, build farm, VPS, proxies, account)
 * as MCP tools so any MCP client (Claude Desktop / Code, etc.) can provision
 * and manage resources, run builds, mint signed URLs, and check balance — over
 * the official SDK.
 *
 * Config (env):
 *   ILLUMINATI_API_KEY   (required)  — an ilnt_ key scoped for the tools you
 *                                      use (cdn:*, builds:*, vps:*, proxies:*,
 *                                      balance:read). Unscoped calls return 403.
 *   ILLUMINATI_BASE_URL  (optional)  — override the API base
 *
 * Run:  ILLUMINATI_API_KEY=ilnt_live_... npx @illuminatinetworks/mcp
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { Illuminati } from '@illuminatinetworks/sdk';

const apiKey = process.env.ILLUMINATI_API_KEY;
if (!apiKey) {
  console.error('ILLUMINATI_API_KEY is required');
  process.exit(1);
}
const il = new Illuminati({ apiKey, baseUrl: process.env.ILLUMINATI_BASE_URL });

const num = { type: 'number' as const };
const str = { type: 'string' as const };

const TOOLS = [
  { name: 'cdn_catalog', description: 'List CDN/object-storage products and pricing.', inputSchema: { type: 'object', properties: {} } },
  { name: 'cdn_list_zones', description: 'List the account\'s CDN zones.', inputSchema: { type: 'object', properties: {} } },
  { name: 'cdn_get_zone', description: 'Get a CDN zone (incl. hostname, usage, upload token).', inputSchema: { type: 'object', properties: { id: num }, required: ['id'] } },
  { name: 'cdn_create_zone', description: 'Provision a new CDN zone (charged from prepaid balance). Returns its hostname + upload token.', inputSchema: { type: 'object', properties: { productCode: str, bandwidthGb: num, storageGb: num, region: str }, required: ['bandwidthGb', 'storageGb'] } },
  { name: 'cdn_topup', description: 'Add prepaid bandwidth GB to a zone (raises the hard cap).', inputSchema: { type: 'object', properties: { id: num, bandwidthGb: num }, required: ['id', 'bandwidthGb'] } },
  { name: 'cdn_delete_zone', description: 'Cancel and tear down a CDN zone.', inputSchema: { type: 'object', properties: { id: num }, required: ['id'] } },
  { name: 'cdn_list_files', description: 'List objects in a zone.', inputSchema: { type: 'object', properties: { id: num, prefix: str }, required: ['id'] } },
  { name: 'cdn_upload_text', description: 'Upload text content to a zone at the given key (served from the zone hostname).', inputSchema: { type: 'object', properties: { id: num, key: str, content: str }, required: ['id', 'key', 'content'] } },
  { name: 'cdn_delete_file', description: 'Delete one object from a zone.', inputSchema: { type: 'object', properties: { id: num, key: str }, required: ['id', 'key'] } },
  { name: 'cdn_sign_url', description: 'Mint a time-limited signed URL for a private-zone object.', inputSchema: { type: 'object', properties: { id: num, key: str, ttlSec: num }, required: ['id', 'key'] } },
  { name: 'cdn_set_visibility', description: 'Set a zone public or private.', inputSchema: { type: 'object', properties: { id: num, visibility: { type: 'string', enum: ['public', 'private'] } }, required: ['id', 'visibility'] } },
  { name: 'cdn_set_cors', description: 'Set a zone\'s allowed CORS origins (comma-separated or "*").', inputSchema: { type: 'object', properties: { id: num, corsOrigins: str }, required: ['id', 'corsOrigins'] } },

  // Build farm (managed CI builds on idle fleet capacity).
  { name: 'build_images', description: 'List available build images (OS + toolchain + per-minute price).', inputSchema: { type: 'object', properties: {} } },
  { name: 'build_submit', description: 'Submit a build. The repo must carry a committed build spec. Charged from prepaid balance. `env` is SECRET env (signing keys, tokens) injected at run time, never committed. `specPath` selects the spec file (default .illuminati-build.yml) for matrix builds.', inputSchema: { type: 'object', properties: { repoUrl: str, ref: str, repoToken: str, env: { type: 'object' }, specPath: str }, required: ['repoUrl'] } },
  { name: 'build_list', description: 'List your build jobs (most recent first).', inputSchema: { type: 'object', properties: {} } },
  { name: 'build_get', description: 'Get a build with its artifacts (signed download URLs + sha256) and log URL.', inputSchema: { type: 'object', properties: { id: num }, required: ['id'] } },
  { name: 'build_cancel', description: 'Cancel a queued build (a running build stops at its timeout).', inputSchema: { type: 'object', properties: { id: num }, required: ['id'] } },
  { name: 'build_create_trigger', description: 'Create a CI-on-push trigger: returns a webhook URL + secret (shown ONCE) to add to your repo so every matching push auto-builds the pushed commit. `repoToken` (GitHub PAT w/ repo:status, or GitLab api token) enables green/red commit status checks. `branch` limits to one branch (omit = all). `env` is secret build vars.', inputSchema: { type: 'object', properties: { repoUrl: str, branch: str, specPath: str, provider: { type: 'string', enum: ['github', 'gitlab'] }, env: { type: 'object' }, repoToken: str }, required: ['repoUrl'] } },
  { name: 'build_list_triggers', description: 'List your build triggers (secrets are never returned).', inputSchema: { type: 'object', properties: {} } },
  { name: 'build_delete_trigger', description: 'Delete a build trigger (its webhook stops firing immediately).', inputSchema: { type: 'object', properties: { id: num }, required: ['id'] } },

  // VPS (servers).
  { name: 'vps_list', description: 'List your VPS instances.', inputSchema: { type: 'object', properties: {} } },
  { name: 'vps_get', description: 'Get one VPS (full detail).', inputSchema: { type: 'object', properties: { id: num }, required: ['id'] } },
  { name: 'vps_create', description: 'Provision a new VPS (charged from prepaid balance).', inputSchema: { type: 'object', properties: { os_template: str, cpu_cores: num, ram_mb: num, disk_gb: num, hostname: str, bandwidth_gb: num, node_id: num }, required: ['os_template', 'cpu_cores', 'ram_mb', 'disk_gb'] } },
  { name: 'vps_power', description: 'Power action on a VPS.', inputSchema: { type: 'object', properties: { id: num, action: { type: 'string', enum: ['start', 'stop', 'reboot', 'shutdown'] } }, required: ['id', 'action'] } },
  { name: 'vps_reinstall', description: 'Reinstall a VPS with a new OS template (async re-provision).', inputSchema: { type: 'object', properties: { id: num, templateId: str }, required: ['id', 'templateId'] } },
  { name: 'vps_console', description: 'Get a time-limited noVNC console ticket for a VPS.', inputSchema: { type: 'object', properties: { id: num }, required: ['id'] } },
  { name: 'vps_snapshots', description: 'List a VPS\'s snapshots.', inputSchema: { type: 'object', properties: { id: num }, required: ['id'] } },
  { name: 'vps_create_snapshot', description: 'Take a VPS snapshot (name: 1-40 chars of [a-z0-9-]).', inputSchema: { type: 'object', properties: { id: num, name: str }, required: ['id', 'name'] } },
  { name: 'vps_delete_snapshot', description: 'Delete a VPS snapshot by name.', inputSchema: { type: 'object', properties: { id: num, name: str }, required: ['id', 'name'] } },

  // Proxies.
  { name: 'proxies_catalog', description: 'List proxy products + pricing.', inputSchema: { type: 'object', properties: {} } },
  { name: 'proxies_plans', description: 'List your active proxy plans.', inputSchema: { type: 'object', properties: {} } },
  { name: 'proxies_get_plan', description: 'Get one proxy plan (credentials + endpoints).', inputSchema: { type: 'object', properties: { id: num }, required: ['id'] } },
  { name: 'proxies_create_plan', description: 'Provision a proxy plan (charged from prepaid balance).', inputSchema: { type: 'object', properties: { productCode: str, quantity: num, billingAxis: str, duration: num, mbps: num, country: str }, required: ['productCode', 'quantity'] } },

  { name: 'account', description: 'Get account profile + balance.', inputSchema: { type: 'object', properties: {} } },
  { name: 'balance', description: 'Get current prepaid balance.', inputSchema: { type: 'object', properties: {} } },
];

async function dispatch(name: string, a: any): Promise<unknown> {
  switch (name) {
    case 'cdn_catalog': return il.cdn.catalog();
    case 'cdn_list_zones': return il.cdn.listZones();
    case 'cdn_get_zone': return il.cdn.getZone(a.id);
    case 'cdn_create_zone': return il.cdn.createZone({ productCode: a.productCode ?? 'storage-cdn', bandwidthGb: a.bandwidthGb, storageGb: a.storageGb, region: a.region });
    case 'cdn_topup': return il.cdn.topup(a.id, a.bandwidthGb);
    case 'cdn_delete_zone': return il.cdn.deleteZone(a.id);
    case 'cdn_list_files': return il.cdn.listFiles(a.id, { prefix: a.prefix });
    case 'cdn_upload_text': {
      const zone = await il.cdn.getZone(a.id);
      await il.cdn.upload(zone, a.key, a.content);
      return { uploaded: a.key, url: `https://${zone.hostname}/${a.key}` };
    }
    case 'cdn_delete_file': return il.cdn.deleteFile(a.id, a.key);
    case 'cdn_sign_url': return il.cdn.signUrl(a.id, a.key, a.ttlSec ?? 3600);
    case 'cdn_set_visibility': return il.cdn.updateSettings(a.id, { visibility: a.visibility });
    case 'cdn_set_cors': return il.cdn.updateSettings(a.id, { corsOrigins: a.corsOrigins });

    case 'build_images': return il.builds.images();
    case 'build_submit': return il.builds.submit({ repoUrl: a.repoUrl, ref: a.ref, repoToken: a.repoToken, env: a.env, specPath: a.specPath });
    case 'build_list': return il.builds.list();
    case 'build_get': return il.builds.get(a.id);
    case 'build_cancel': return il.builds.cancel(a.id);
    case 'build_create_trigger': return il.builds.triggers.create({ repoUrl: a.repoUrl, branch: a.branch, specPath: a.specPath, provider: a.provider, env: a.env, repoToken: a.repoToken });
    case 'build_list_triggers': return il.builds.triggers.list();
    case 'build_delete_trigger': return il.builds.triggers.delete(a.id);

    case 'vps_list': return il.vps.list();
    case 'vps_get': return il.vps.get(a.id);
    case 'vps_create': return il.vps.create({ os_template: a.os_template, cpu_cores: a.cpu_cores, ram_mb: a.ram_mb, disk_gb: a.disk_gb, hostname: a.hostname, bandwidth_gb: a.bandwidth_gb, node_id: a.node_id });
    case 'vps_power': return il.vps.power(a.id, a.action);
    case 'vps_reinstall': return il.vps.reinstall(a.id, a.templateId);
    case 'vps_console': return il.vps.console(a.id);
    case 'vps_snapshots': return il.vps.snapshots(a.id);
    case 'vps_create_snapshot': return il.vps.createSnapshot(a.id, a.name);
    case 'vps_delete_snapshot': return il.vps.deleteSnapshot(a.id, a.name);

    case 'proxies_catalog': return il.proxies.catalog();
    case 'proxies_plans': return il.proxies.plans();
    case 'proxies_get_plan': return il.proxies.getPlan(a.id);
    case 'proxies_create_plan': return il.proxies.createPlan({ productCode: a.productCode, quantity: a.quantity, billingAxis: a.billingAxis, duration: a.duration, mbps: a.mbps, country: a.country });

    case 'account': return il.account();
    case 'balance': return il.balance();
    default: throw new Error(`Unknown tool: ${name}`);
  }
}

const server = new Server({ name: 'illuminati-networks', version: '1.0.0' }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;
  try {
    const result = await dispatch(name, args ?? {});
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  } catch (err: any) {
    return { isError: true, content: [{ type: 'text', text: `Error: ${err?.message ?? 'failed'}` }] };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
console.error('Illuminati MCP server running (stdio).');
