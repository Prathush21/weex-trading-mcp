# WEEX Trading MCP

An [MCP](https://modelcontextprotocol.io/) server for the [WEEX Exchange](https://www.weex.com/api-doc/spot/introduction/APIBriefIntroduction) REST API.

Covers **Spot V3** (`api-spot.weex.com`) and **Futures / Contract V3** (`api-contract.weex.com`):

- Public market data — no API key required
- Signed account & trading endpoints — requires API key, secret, and passphrase

## Run via `npx`

```bash
# Read-only (public market tools only)
npx -y weex-trading-mcp

# With credentials (enables signed account / trading tools)
WEEX_API_KEY=... \
WEEX_API_SECRET=... \
WEEX_API_PASSPHRASE=... \
npx -y weex-trading-mcp
```

The server speaks MCP over **stdio**, so you don't run it directly — point an MCP-compatible client at it.

## Claude Desktop config

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "weex": {
      "command": "npx",
      "args": ["-y", "weex-trading-mcp"],
      "env": {
        "WEEX_API_KEY": "your-key",
        "WEEX_API_SECRET": "your-secret",
        "WEEX_API_PASSPHRASE": "your-passphrase"
      }
    }
  }
}
```

Restart Claude Desktop — the WEEX tools will appear in the tools panel.

## Claude Code config

```bash
claude mcp add weex -- npx -y weex-trading-mcp
```

…then set the env vars in your shell, or pass `--env` flags. See `claude mcp add --help`.

## Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `WEEX_API_KEY` | for signed tools | Your WEEX API key |
| `WEEX_API_SECRET` | for signed tools | Your WEEX API secret |
| `WEEX_API_PASSPHRASE` | for signed tools | Your WEEX API passphrase |
| `WEEX_SPOT_BASE_URL` | no | Override spot base URL (default `https://api-spot.weex.com`) |
| `WEEX_FUTURES_BASE_URL` | no | Override futures base URL (default `https://api-contract.weex.com`) |

## Tools

### Spot — public

| Tool | Endpoint |
| --- | --- |
| `weex_spot_exchange_info` | `GET /api/v3/exchangeInfo` |
| `weex_spot_klines` | `GET /api/v3/market/klines` |
| `weex_spot_ticker_price` | `GET /api/v3/market/ticker/price` |
| `weex_spot_ticker_24hr` | `GET /api/v3/market/ticker/24hr` |
| `weex_spot_recent_trades` | `GET /api/v3/market/trades` |
| `weex_spot_orderbook` | `GET /api/v3/market/depth` |

### Spot — signed

| Tool | Endpoint |
| --- | --- |
| `weex_spot_account` | `GET /api/v3/account/` |
| `weex_spot_place_order` | `POST /api/v3/order` |
| `weex_spot_get_order` | `GET /api/v3/order` |
| `weex_spot_cancel_order` | `DELETE /api/v3/order` |

### Futures — public

| Tool | Endpoint |
| --- | --- |
| `weex_futures_server_time` | `GET /capi/v3/market/time` |
| `weex_futures_exchange_info` | `GET /capi/v3/market/exchangeInfo` |
| `weex_futures_klines` | `GET /capi/v3/market/klines` |
| `weex_futures_recent_trades` | `GET /capi/v2/market/trades` |
| `weex_futures_orderbook` | `GET /capi/v3/market/depth` |
| `weex_futures_open_interest` | `GET /capi/v2/market/open_interest` |
| `weex_futures_index_price` | `GET /capi/v2/market/index` |

### Futures — signed

| Tool | Endpoint |
| --- | --- |
| `weex_futures_accounts` | `GET /capi/v2/account/getAccounts` |
| `weex_futures_place_order` | `POST /capi/v3/order` |
| `weex_futures_current_orders` | `GET /capi/v3/openOrders` |
| `weex_futures_cancel_order` | `DELETE /capi/v3/order` |

### Escape hatch

| Tool | Use case |
| --- | --- |
| `weex_signed_request` | Call any WEEX endpoint not covered above. Choose `product: "spot"` or `"futures"`, set `method`, `path`, optional `query` / `body`, and `signed: true` if the endpoint requires auth. |

## Signing

Per the [WEEX signature spec](https://www.weex.com/api-doc/spot/QuickStart/Signature), each signed request includes:

- `ACCESS-KEY` — your API key
- `ACCESS-TIMESTAMP` — current time in milliseconds (must be within 30s of server time)
- `ACCESS-PASSPHRASE` — the passphrase you set when creating the key
- `ACCESS-SIGN` — `Base64( HMAC_SHA256(secret, timestamp + METHOD + path + "?" + queryString + body) )`

This server handles the signing transparently for tools marked **signed**.

## Safety

Signed trading tools place real orders against your live WEEX account. Review every tool call before approving it in your MCP client, and only grant `WEEX_API_PASSPHRASE` to trusted environments. WEEX recommends binding API keys to specific IPs.

## Support, issues & feature requests

This project is open source and actively maintained — head over to the GitHub repo and have a look:

**[github.com/Prathush21/weex-trading-mcp](https://github.com/Prathush21/weex-trading-mcp)**

A few ways you can help:

- **Star the repo** if you find it useful — it's the quickest way to show support and helps others discover the project.
- **Report a bug** at [github.com/Prathush21/weex-trading-mcp/issues](https://github.com/Prathush21/weex-trading-mcp/issues). When opening an issue, please include the tool name, the arguments you used, and the error response if any. Run with `WEEX_DEBUG=1` set in the environment to capture the exact request URL and a response preview on stderr.
- **Request an endpoint.** This server doesn't yet wrap every WEEX endpoint — if there's one you need (margin, sub-account, position management, conditional orders, etc.), open an issue describing the endpoint, the WEEX docs link, and your use case. In the meantime, the `weex_signed_request` escape-hatch tool lets you call any endpoint by hand.
- **Pull requests welcome** — small, focused PRs (one fix or one new tool) are easiest to review.

## License

MIT
