#!/usr/bin/env node
/**
 * Illuminati Networks MCP server.
 *
 * Exposes the platform (CDN/object storage + account) as MCP tools so any
 * MCP client (Claude Desktop / Code, etc.) can provision zones, upload/manage
 * files, mint signed URLs, and check balance — over the official SDK.
 *
 * Config (env):
 *   ILLUMINATI_API_KEY   (required)  — an ilnt_ key with cdn:* + balance:read
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
