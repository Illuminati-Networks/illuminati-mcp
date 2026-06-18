# @illuminatinetworks/mcp

MCP server for [Illuminati Networks](https://illuminatinetworks.com) — drive your **CDN / object storage** (and account) from any MCP client (Claude Desktop, Claude Code, etc.).

## Setup

Get an API key in the dashboard → **Developer → API Keys** (scopes: `cdn:read`, `cdn:write`, `balance:read`).

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

Then ask: *"Provision a 100GB CDN zone and upload this file"*, *"make zone 5 private and give me a 1-hour signed link for report.pdf"*, *"how much CDN bandwidth has zone 5 used?"*

## Tools

| Tool | What it does |
|---|---|
| `cdn_catalog` | products + pricing |
| `cdn_create_zone` | provision a zone (prepaid) → returns hostname + upload token |
| `cdn_list_zones` · `cdn_get_zone` | list / inspect |
| `cdn_upload_text` | upload text content to a key |
| `cdn_list_files` · `cdn_delete_file` | manage objects |
| `cdn_sign_url` | signed URL for a private object |
| `cdn_set_visibility` · `cdn_set_cors` | access controls |
| `cdn_topup` · `cdn_delete_zone` | bandwidth / teardown |
| `account` · `balance` | account + prepaid balance |

## Config

- `ILLUMINATI_API_KEY` (required)
- `ILLUMINATI_BASE_URL` (optional) — override the API base

Built on [`@illuminatinetworks/sdk`](https://github.com/alphajew420/illuminati-sdk). Prepaid + hard-capped: bandwidth you buy is enforced at the edge, so automated agents can't run up a surprise bill.
