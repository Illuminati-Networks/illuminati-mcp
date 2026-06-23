# @illuminatinetworks/mcp

MCP server for [Illuminati Networks](https://illuminatinetworks.com) — drive your **CDN / object storage, build farm, VPS, and proxies** (and account) from any MCP client (Claude Desktop, Claude Code, etc.).

## Setup

Get an API key in the dashboard → **Developer → API Keys**. Grant the scopes for the tools you'll use: `cdn:*`, `builds:*`, `vps:*`, `proxies:*`, `balance:read`. (Unscoped tool calls return 403 — grant least privilege.)

### Claude Desktop / Claude Code

Add to your MCP config (e.g. `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "illuminati": {
      "command": "npx",
      "args": ["-y", "@illuminatinetworks/mcp"],
      "env": { "ILLUMINATI_API_KEY": "ilnt_live_..." }
    }
  }
}
```

Then ask: *"Provision a 100GB CDN zone and upload this file"*, *"submit a build of github.com/me/app on main and tell me when it's done"*, *"reboot VPS 12"*, *"how much CDN bandwidth has zone 5 used?"*

## Tools

| Tool | What it does |
|---|---|
| **CDN** | |
| `cdn_catalog` | products + pricing |
| `cdn_create_zone` | provision a zone (prepaid) → returns hostname + upload token |
| `cdn_list_zones` · `cdn_get_zone` | list / inspect |
| `cdn_upload_text` | upload text content to a key |
| `cdn_list_files` · `cdn_delete_file` | manage objects |
| `cdn_sign_url` | signed URL for a private object |
| `cdn_set_visibility` · `cdn_set_cors` | access controls |
| `cdn_topup` · `cdn_delete_zone` | bandwidth / teardown |
| **Build farm** | |
| `build_images` | available build images + per-minute price |
| `build_submit` | submit a build (repo needs `.illuminati-build.yml`) |
| `build_list` · `build_get` | list / inspect (artifacts + sha256 + log URL) |
| `build_cancel` | cancel a queued build |
| **VPS** | |
| `vps_list` · `vps_get` | list / inspect |
| `vps_create` | provision a VPS (prepaid) |
| `vps_power` | start / stop / reboot / shutdown |
| `vps_reinstall` · `vps_console` | reinstall / noVNC ticket |
| `vps_snapshots` · `vps_create_snapshot` · `vps_delete_snapshot` | snapshots |
| **Proxies** | |
| `proxies_catalog` · `proxies_plans` · `proxies_get_plan` | catalog / list / inspect |
| `proxies_create_plan` | provision a proxy plan (prepaid) |
| **Account** | |
| `account` · `balance` | account + prepaid balance |

## Config

- `ILLUMINATI_API_KEY` (required)
- `ILLUMINATI_BASE_URL` (optional) — override the API base

Built on [`@illuminatinetworks/sdk`](../sdk). Prepaid + hard-capped: bandwidth you buy is enforced at the edge, so automated agents can't run up a surprise bill.
