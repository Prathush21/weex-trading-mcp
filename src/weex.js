// WEEX REST client with HMAC-SHA256 + Base64 request signing.
//
// Signing algorithm (per docs):
//   pre = timestamp + METHOD + requestPath + ("?" + queryString | "") + body
//   sign = Base64( HMAC_SHA256(secretKey, pre) )
//
// Required headers for private endpoints:
//   ACCESS-KEY, ACCESS-SIGN, ACCESS-TIMESTAMP (ms), ACCESS-PASSPHRASE

import crypto from "node:crypto";

const SPOT_BASE_URL =
  process.env.WEEX_SPOT_BASE_URL || "https://api-spot.weex.com";
const FUTURES_BASE_URL =
  process.env.WEEX_FUTURES_BASE_URL || "https://api-contract.weex.com";

const API_KEY = process.env.WEEX_API_KEY || "";
const API_SECRET = process.env.WEEX_API_SECRET || "";
const API_PASSPHRASE = process.env.WEEX_API_PASSPHRASE || "";

export const baseUrlFor = (product) =>
  product === "futures" ? FUTURES_BASE_URL : SPOT_BASE_URL;

export const hasCredentials = () =>
  Boolean(API_KEY && API_SECRET && API_PASSPHRASE);

function sortedQueryString(params) {
  if (!params) return "";
  const entries = Object.entries(params).filter(
    ([, v]) => v !== undefined && v !== null && v !== ""
  );
  if (entries.length === 0) return "";
  const sp = new URLSearchParams();
  for (const [k, v] of entries) sp.append(k, String(v));
  return sp.toString();
}

function sign({ timestamp, method, requestPath, queryString, body }) {
  const prehash =
    `${timestamp}${method.toUpperCase()}${requestPath}` +
    (queryString ? `?${queryString}` : "") +
    (body || "");
  return crypto
    .createHmac("sha256", API_SECRET)
    .update(prehash)
    .digest("base64");
}

async function readJsonOrText(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/**
 * Execute a WEEX REST request.
 *
 * @param {Object} opts
 * @param {"spot"|"futures"} opts.product
 * @param {"GET"|"POST"|"PUT"|"DELETE"} opts.method
 * @param {string} opts.path                e.g. "/api/v3/market/klines"
 * @param {Record<string, any>} [opts.query]
 * @param {Record<string, any>} [opts.body]
 * @param {boolean} [opts.signed]           whether the endpoint requires auth
 */
export async function weexRequest({
  product,
  method,
  path,
  query,
  body,
  signed = false,
}) {
  const base = baseUrlFor(product);
  const queryString = sortedQueryString(query);
  const bodyString =
    body && Object.keys(body).length > 0 ? JSON.stringify(body) : "";

  const url =
    base + path + (queryString ? `?${queryString}` : "");

  const headers = {
    "Content-Type": "application/json",
    "User-Agent": "weex-trading-mcp/0.1",
  };

  if (signed) {
    if (!hasCredentials()) {
      throw new Error(
        "Missing WEEX credentials. Set WEEX_API_KEY, WEEX_API_SECRET, and WEEX_API_PASSPHRASE."
      );
    }
    const timestamp = String(Date.now());
    const signature = sign({
      timestamp,
      method,
      requestPath: path,
      queryString,
      body: bodyString,
    });
    headers["ACCESS-KEY"] = API_KEY;
    headers["ACCESS-SIGN"] = signature;
    headers["ACCESS-TIMESTAMP"] = timestamp;
    headers["ACCESS-PASSPHRASE"] = API_PASSPHRASE;
  }

  const init = { method, headers };
  if (bodyString) init.body = bodyString;

  if (process.env.WEEX_DEBUG === "1") {
    console.error(`[weex-debug] ${method} ${url}${bodyString ? ` body=${bodyString}` : ""}`);
  }

  const res = await fetch(url, init);
  const data = await readJsonOrText(res);

  if (process.env.WEEX_DEBUG === "1") {
    const preview =
      typeof data === "string"
        ? data.slice(0, 200)
        : JSON.stringify(data).slice(0, 200);
    console.error(`[weex-debug] <- HTTP ${res.status} ${preview}${preview.length >= 200 ? "…" : ""}`);
  }

  if (!res.ok) {
    const err = new Error(
      `WEEX ${method} ${path} failed: HTTP ${res.status}`
    );
    err.status = res.status;
    err.response = data;
    throw err;
  }
  return data;
}
