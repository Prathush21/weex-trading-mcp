// WEEX Trading MCP server.
//
// Exposes WEEX Spot (V3) and Futures/Contract (V3) endpoints as MCP tools
// over the stdio transport. Read-only market tools are unauthenticated;
// account/trading tools sign requests with HMAC-SHA256 using credentials
// from environment variables.

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { weexRequest, hasCredentials } from "./weex.js";

// ---------- Tool definitions ----------
//
// Each tool: { name, description, inputSchema (zod), handler(args) }
// The handler returns a value that will be JSON-stringified into the MCP
// tool result. Throwing rejects the call with an error.

const SymbolStr = z.string().min(1).describe("Trading pair, e.g. BTCUSDT");
const Interval = z
  .enum([
    "1m",
    "5m",
    "15m",
    "30m",
    "1h",
    "2h",
    "4h",
    "6h",
    "8h",
    "12h",
    "1d",
    "1w",
    "1M",
  ])
  .describe("Kline interval");

const tools = [
  // ===== Spot — Public market data =====
  {
    name: "weex_spot_exchange_info",
    description:
      "Spot: get exchange information (server time, symbols, precisions, trading rules). Public.",
    inputSchema: z.object({
      symbol: SymbolStr.optional(),
      symbols: z
        .array(z.string())
        .optional()
        .describe("Multiple trading pairs"),
      symbolStatus: z
        .string()
        .optional()
        .describe("Filter by status, e.g. TRADING"),
    }),
    handler: (args) =>
      weexRequest({
        product: "spot",
        method: "GET",
        path: "/api/v3/exchangeInfo",
        query: {
          ...args,
          symbols: args.symbols ? JSON.stringify(args.symbols) : undefined,
        },
      }),
  },
  {
    name: "weex_spot_klines",
    description:
      "Spot: get candlestick (kline) data. Returns an array of [openTime, open, high, low, close, volume, closeTime, quoteVolume, trades, takerBuyBase, takerBuyQuote].",
    inputSchema: z.object({
      symbol: SymbolStr,
      interval: Interval,
      limit: z.number().int().min(1).max(1000).optional(),
    }),
    handler: (args) =>
      weexRequest({
        product: "spot",
        method: "GET",
        path: "/api/v3/market/klines",
        query: args,
      }),
  },
  {
    name: "weex_spot_ticker_price",
    description:
      "Spot: latest traded price for one or more symbols. Omit both args for all symbols.",
    inputSchema: z.object({
      symbol: SymbolStr.optional(),
      symbols: z.array(z.string()).optional(),
    }),
    handler: (args) =>
      weexRequest({
        product: "spot",
        method: "GET",
        path: "/api/v3/market/ticker/price",
        query: {
          symbol: args.symbol,
          symbols: args.symbols ? JSON.stringify(args.symbols) : undefined,
        },
      }),
  },
  {
    name: "weex_spot_ticker_24hr",
    description:
      "Spot: 24-hour rolling window price/volume statistics for one or more symbols.",
    inputSchema: z.object({
      symbol: SymbolStr.optional(),
      symbols: z.array(z.string()).optional(),
    }),
    handler: (args) =>
      weexRequest({
        product: "spot",
        method: "GET",
        path: "/api/v3/market/ticker/24hr",
        query: {
          symbol: args.symbol,
          symbols: args.symbols ? JSON.stringify(args.symbols) : undefined,
        },
      }),
  },
  {
    name: "weex_spot_recent_trades",
    description: "Spot: recent trades for a symbol (default 100, max 1000).",
    inputSchema: z.object({
      symbol: SymbolStr,
      limit: z.number().int().min(1).max(1000).optional(),
    }),
    handler: (args) =>
      weexRequest({
        product: "spot",
        method: "GET",
        path: "/api/v3/market/trades",
        query: args,
      }),
  },
  {
    name: "weex_spot_orderbook",
    description: "Spot: order book depth (bids/asks) for a symbol.",
    inputSchema: z.object({
      symbol: SymbolStr,
      limit: z
        .number()
        .int()
        .min(1)
        .max(1000)
        .optional()
        .describe("Number of price levels per side"),
    }),
    handler: (args) =>
      weexRequest({
        product: "spot",
        method: "GET",
        path: "/api/v3/market/depth",
        query: args,
      }),
  },

  // ===== Spot — Private (signed) =====
  {
    name: "weex_spot_account",
    description:
      "Spot: get account information including balances and trading permissions. SIGNED.",
    inputSchema: z.object({}),
    handler: () =>
      weexRequest({
        product: "spot",
        method: "GET",
        path: "/api/v3/account/",
        signed: true,
      }),
  },
  {
    name: "weex_spot_place_order",
    description:
      "Spot: place a new order. SIGNED. For LIMIT orders, price and timeInForce are required.",
    inputSchema: z.object({
      symbol: SymbolStr,
      side: z.enum(["BUY", "SELL"]),
      type: z.enum(["LIMIT", "MARKET"]),
      quantity: z.string().describe("Order quantity as a string"),
      price: z.string().optional().describe("Required for LIMIT orders"),
      timeInForce: z
        .enum(["GTC", "IOC", "FOK"])
        .optional()
        .describe("Required for LIMIT orders"),
      newClientOrderId: z.string().optional(),
    }),
    handler: (args) =>
      weexRequest({
        product: "spot",
        method: "POST",
        path: "/api/v3/order",
        body: args,
        signed: true,
      }),
  },
  {
    name: "weex_spot_get_order",
    description:
      "Spot: get details for a single order by orderId or origClientOrderId. SIGNED.",
    inputSchema: z
      .object({
        symbol: SymbolStr.optional(),
        orderId: z.union([z.string(), z.number()]).optional(),
        origClientOrderId: z.string().optional(),
      })
      .refine((v) => v.orderId !== undefined || v.origClientOrderId, {
        message: "Provide orderId or origClientOrderId",
      }),
    handler: (args) =>
      weexRequest({
        product: "spot",
        method: "GET",
        path: "/api/v3/order",
        query: args,
        signed: true,
      }),
  },
  {
    name: "weex_spot_cancel_order",
    description:
      "Spot: cancel an active order by orderId or origClientOrderId. SIGNED.",
    inputSchema: z
      .object({
        symbol: SymbolStr,
        orderId: z.union([z.string(), z.number()]).optional(),
        origClientOrderId: z.string().optional(),
      })
      .refine((v) => v.orderId !== undefined || v.origClientOrderId, {
        message: "Provide orderId or origClientOrderId",
      }),
    handler: (args) =>
      weexRequest({
        product: "spot",
        method: "DELETE",
        path: "/api/v3/order",
        query: args,
        signed: true,
      }),
  },

  // ===== Futures (Contract) — Public market data =====
  {
    name: "weex_futures_server_time",
    description: "Futures: get contract API server time (milliseconds).",
    inputSchema: z.object({}),
    handler: () =>
      weexRequest({
        product: "futures",
        method: "GET",
        path: "/capi/v3/market/time",
      }),
  },
  {
    name: "weex_futures_exchange_info",
    description:
      "Futures: contract specifications — leverage limits, precision, fees, etc.",
    inputSchema: z.object({
      symbol: SymbolStr.optional().describe(
        "Omit to retrieve all supported contracts"
      ),
    }),
    handler: (args) =>
      weexRequest({
        product: "futures",
        method: "GET",
        path: "/capi/v3/market/exchangeInfo",
        query: args,
      }),
  },
  {
    name: "weex_futures_klines",
    description: "Futures: candlestick (kline) data for a contract symbol.",
    inputSchema: z.object({
      symbol: SymbolStr,
      interval: z.enum([
        "1m",
        "5m",
        "15m",
        "30m",
        "1h",
        "4h",
        "12h",
        "1d",
        "1w",
      ]),
      limit: z.number().int().min(1).max(1000).optional(),
    }),
    handler: (args) =>
      weexRequest({
        product: "futures",
        method: "GET",
        path: "/capi/v3/market/klines",
        query: args,
      }),
  },
  {
    name: "weex_futures_recent_trades",
    description: "Futures: recent trades for a contract symbol.",
    inputSchema: z.object({
      symbol: SymbolStr,
      limit: z.number().int().min(1).max(1000).optional(),
    }),
    handler: (args) =>
      weexRequest({
        product: "futures",
        method: "GET",
        path: "/capi/v2/market/trades",
        query: args,
      }),
  },
  {
    name: "weex_futures_orderbook",
    description: "Futures: order book depth for a contract symbol.",
    inputSchema: z.object({
      symbol: SymbolStr,
      limit: z.number().int().min(1).max(1000).optional(),
    }),
    handler: (args) =>
      weexRequest({
        product: "futures",
        method: "GET",
        path: "/capi/v3/market/depth",
        query: args,
      }),
  },
  {
    name: "weex_futures_open_interest",
    description: "Futures: total platform open interest.",
    inputSchema: z.object({ symbol: SymbolStr.optional() }),
    handler: (args) =>
      weexRequest({
        product: "futures",
        method: "GET",
        path: "/capi/v2/market/open_interest",
        query: args,
      }),
  },
  {
    name: "weex_futures_index_price",
    description: "Futures: cryptocurrency index price.",
    inputSchema: z.object({ symbol: SymbolStr.optional() }),
    handler: (args) =>
      weexRequest({
        product: "futures",
        method: "GET",
        path: "/capi/v2/market/index",
        query: args,
      }),
  },

  // ===== Futures — Private (signed) =====
  {
    name: "weex_futures_accounts",
    description: "Futures: get contract account list / balances. SIGNED.",
    inputSchema: z.object({}),
    handler: () =>
      weexRequest({
        product: "futures",
        method: "GET",
        path: "/capi/v2/account/getAccounts",
        signed: true,
      }),
  },
  {
    name: "weex_futures_place_order",
    description:
      "Futures: place a new contract order. SIGNED. positionSide is LONG or SHORT (hedge mode). For LIMIT orders price and timeInForce are required.",
    inputSchema: z.object({
      symbol: SymbolStr,
      side: z.enum(["BUY", "SELL"]),
      positionSide: z.enum(["LONG", "SHORT"]),
      type: z.enum(["LIMIT", "MARKET"]),
      quantity: z.string(),
      price: z.string().optional(),
      timeInForce: z.enum(["GTC", "IOC", "FOK"]).optional(),
      newClientOrderId: z.string().optional(),
      tpTriggerPrice: z.string().optional(),
      slTriggerPrice: z.string().optional(),
      TpWorkingType: z.enum(["CONTRACT_PRICE", "MARK_PRICE"]).optional(),
      SlWorkingType: z.enum(["CONTRACT_PRICE", "MARK_PRICE"]).optional(),
    }),
    handler: (args) =>
      weexRequest({
        product: "futures",
        method: "POST",
        path: "/capi/v3/order",
        body: args,
        signed: true,
      }),
  },
  {
    name: "weex_futures_current_orders",
    description: "Futures: get current (open) orders. SIGNED.",
    inputSchema: z.object({ symbol: SymbolStr.optional() }),
    handler: (args) =>
      weexRequest({
        product: "futures",
        method: "GET",
        path: "/capi/v3/order/current",
        query: args,
        signed: true,
      }),
  },
  {
    name: "weex_futures_cancel_order",
    description: "Futures: cancel an order by orderId. SIGNED.",
    inputSchema: z.object({
      symbol: SymbolStr,
      orderId: z.union([z.string(), z.number()]).optional(),
      newClientOrderId: z.string().optional(),
    }),
    handler: (args) =>
      weexRequest({
        product: "futures",
        method: "DELETE",
        path: "/capi/v3/order",
        query: args,
        signed: true,
      }),
  },

  // ===== Escape hatch for endpoints not modeled above =====
  {
    name: "weex_signed_request",
    description:
      "Generic WEEX request. Use this for endpoints not explicitly exposed above. Specify product (spot or futures), HTTP method, full path (starting with /api/v3 for spot or /capi/v2 or /capi/v3 for futures), optional query and body, and whether the endpoint must be signed.",
    inputSchema: z.object({
      product: z.enum(["spot", "futures"]),
      method: z.enum(["GET", "POST", "PUT", "DELETE"]),
      path: z.string().startsWith("/"),
      query: z.record(z.any()).optional(),
      body: z.record(z.any()).optional(),
      signed: z.boolean().default(false),
    }),
    handler: (args) => weexRequest(args),
  },
];

// ---------- MCP plumbing ----------

function zodToJsonSchema(schema) {
  // Minimal converter for the shapes used above. We avoid pulling in
  // zod-to-json-schema to keep deps light; MCP clients only need a
  // reasonable JSON Schema describing the inputs.
  const def = schema._def;

  if (def.typeName === "ZodEffects") return zodToJsonSchema(def.schema);

  if (def.typeName === "ZodObject") {
    const shape =
      typeof def.shape === "function" ? def.shape() : def.shape;
    const properties = {};
    const required = [];
    for (const [key, value] of Object.entries(shape)) {
      properties[key] = zodToJsonSchema(value);
      if (!value.isOptional()) required.push(key);
    }
    const out = { type: "object", properties };
    if (required.length) out.required = required;
    return out;
  }
  if (def.typeName === "ZodString") {
    const out = { type: "string" };
    if (def.description) out.description = def.description;
    return out;
  }
  if (def.typeName === "ZodNumber") return { type: "number" };
  if (def.typeName === "ZodBoolean") return { type: "boolean" };
  if (def.typeName === "ZodEnum")
    return { type: "string", enum: def.values };
  if (def.typeName === "ZodArray")
    return { type: "array", items: zodToJsonSchema(def.type) };
  if (def.typeName === "ZodOptional" || def.typeName === "ZodDefault")
    return zodToJsonSchema(def.innerType);
  if (def.typeName === "ZodUnion")
    return { anyOf: def.options.map(zodToJsonSchema) };
  if (def.typeName === "ZodRecord") return { type: "object" };
  if (def.typeName === "ZodAny") return {};
  return {};
}

export async function main() {
  const server = new Server(
    { name: "weex-trading-mcp", version: "0.1.0" },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: zodToJsonSchema(t.inputSchema),
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const tool = tools.find((t) => t.name === req.params.name);
    if (!tool) {
      return {
        isError: true,
        content: [
          { type: "text", text: `Unknown tool: ${req.params.name}` },
        ],
      };
    }
    try {
      const parsed = tool.inputSchema.parse(req.params.arguments ?? {});
      const result = await tool.handler(parsed);
      return {
        content: [
          { type: "text", text: JSON.stringify(result, null, 2) },
        ],
      };
    } catch (err) {
      const payload = {
        error: err.message,
        status: err.status,
        response: err.response,
      };
      return {
        isError: true,
        content: [
          { type: "text", text: JSON.stringify(payload, null, 2) },
        ],
      };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error(
    `[weex-trading-mcp] ready — ${tools.length} tools, signed=${hasCredentials() ? "yes" : "no"}`
  );
}
