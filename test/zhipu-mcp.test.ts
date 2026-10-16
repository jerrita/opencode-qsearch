import assert from "node:assert/strict";
import test from "node:test";
import { SearchError } from "../src/errors.js";
import { ZHIPU_SEARCH_MCP_URL } from "../src/zhipu-mcp.js";
import { zhipuSearch } from "../src/zhipu.js";

const KEY = "synthetic-mcp-key";
const QUERY = "Example documentation";
const ITEM = { title: "Example", link: "https://example.org/docs", content: "Documentation" };

type Message = {
  jsonrpc: string;
  id?: number;
  method: string;
  params?: { name?: string; arguments?: unknown; cursor?: string };
};

type BackendOptions = {
  toolName?: string;
  content?: unknown;
  isError?: boolean;
  sse?: boolean;
  paginate?: boolean;
  missingTool?: boolean;
  cleanupStatus?: number;
  onCall?: (message: Message, signal: AbortSignal) => Response | Promise<Response>;
};

async function withBackend(
  options: BackendOptions,
  run: (requests: { method: string; message?: Message; headers: Headers }[]) => Promise<void>,
) {
  const originalFetch = globalThis.fetch;
  const requests: { method: string; message?: Message; headers: Headers }[] = [];
  globalThis.fetch = async (input, init) => {
    assert.equal(String(input), ZHIPU_SEARCH_MCP_URL);
    assert.equal(init?.redirect, "error");
    const headers = new Headers(init?.headers);
    assert.equal(headers.get("authorization"), `Bearer ${KEY}`);
    const method = init?.method ?? "GET";
    const message: Message | undefined = init?.body ? JSON.parse(String(init.body)) : undefined;
    requests.push({ method, message, headers });
    if (message?.method !== "initialize") {
      assert.equal(headers.get("mcp-session-id"), "synthetic-session");
      assert.equal(headers.get("mcp-protocol-version"), "2024-11-05");
    }
    if (method === "GET") return new Response(null, { status: 405 });
    if (method === "DELETE") {
      assert.equal(init?.signal?.aborted, false);
      return new Response(null, { status: options.cleanupStatus ?? 200 });
    }
    assert.ok(message);
    assert.ok(headers.get("accept")?.includes("text/event-stream"));
    assert.equal(message.jsonrpc, "2.0");
    if (message.method.startsWith("notifications/")) {
      return new Response(null, { status: 202 });
    }
    let result: unknown;
    switch (message.method) {
      case "initialize":
        result = {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: { name: "synthetic-search", version: "1.0.0" },
        };
        break;
      case "tools/list":
        result =
          options.paginate && !message.params?.cursor
            ? { tools: [], nextCursor: "second-page" }
            : {
                tools: options.missingTool
                  ? []
                  : [
                      {
                        name: options.toolName ?? "web_search_prime",
                        inputSchema: {
                          type: "object",
                          properties: { search_query: { type: "string" } },
                          required: ["search_query"],
                          additionalProperties: false,
                        },
                      },
                    ],
              };
        break;
      case "tools/call":
        assert.deepEqual(message.params?.arguments, { search_query: QUERY });
        assert.equal(message.params?.name, options.toolName ?? "web_search_prime");
        if (options.onCall) return options.onCall(message, init?.signal as AbortSignal);
        result = {
          content: options.content ?? [
            { type: "text", text: JSON.stringify(JSON.stringify([ITEM])) },
          ],
          isError: options.isError ?? false,
        };
        break;
      default:
        throw new Error(`Unexpected method: ${message.method}`);
    }
    const body = JSON.stringify({ jsonrpc: "2.0", id: message.id, result });
    return new Response(options.sse ? `event: message\ndata: ${body}\n\n` : body, {
      headers: {
        "Content-Type": options.sse ? "text/event-stream;charset=UTF-8" : "application/json",
        ...(message.method === "initialize" ? { "Mcp-Session-Id": "synthetic-session" } : {}),
      },
    });
  };
  try {
    await run(requests);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

function search(signal?: AbortSignal, count = 8) {
  return zhipuSearch(KEY, QUERY, { searchEngine: "search_mcp", count }, signal);
}

test("MCP branch negotiates SSE, discovers a paginated tool and decodes double JSON", async () => {
  await withBackend({ sse: true, paginate: true }, async (requests) => {
    assert.deepEqual(await search(), [
      { url: ITEM.link, title: ITEM.title, content: ITEM.content, time: {} },
    ]);
    assert.equal(requests.filter((r) => r.message?.method === "tools/list").length, 2);
    assert.ok(requests.some((r) => r.message?.method === "notifications/initialized"));
    assert.ok(requests.some((r) => r.method === "DELETE"));
  });
});

test("MCP branch accepts the documented tool name, filters invalid links and caps results", async () => {
  const entries = [
    null,
    { link: "invalid" },
    { link: "file:///etc/hosts" },
    { title: "No link" },
    { ...ITEM, publish_date: "2026-01-01" },
    { link: "https://example.org/second", title: 123, content: false },
    { link: "https://example.org/third" },
  ];
  await withBackend(
    { toolName: "webSearchPrime", content: [{ type: "text", text: JSON.stringify(entries) }] },
    async () => {
      assert.deepEqual(await search(undefined, 2), [
        {
          url: ITEM.link,
          title: ITEM.title,
          content: ITEM.content,
          time: { published: Date.parse("2026-01-01") },
        },
        { url: "https://example.org/second", time: {} },
      ]);
    },
  );
});

test("MCP branch returns an empty search list", async () => {
  await withBackend({ content: [{ type: "text", text: "[]" }] }, async () => {
    assert.deepEqual(await search(), []);
  });
});

for (const [name, options, expected] of [
  ["missing tool", { missingTool: true }, /tool not found/],
  ["tool failure", { isError: true }, /tool returned an error/],
  ["missing text", { content: [] }, /no search text/],
  ["invalid JSON", { content: [{ type: "text", text: "invalid" }] }, /invalid search JSON/],
  ["invalid list", { content: [{ type: "text", text: "{}" }] }, /invalid result list/],
] as const) {
  test(`MCP branch rejects ${name} and cleans up without REST fallback`, async () => {
    await withBackend(options, async (requests) => {
      await assert.rejects(
        search(),
        (error: unknown) => error instanceof SearchError && expected.test(error.message),
      );
      assert.equal(requests.filter((r) => r.method === "DELETE").length, 1);
    });
  });
}

test("MCP HTTP errors preserve status and hide remote credentials", async () => {
  await withBackend(
    { onCall: () => new Response(`Unauthorized ${KEY}`, { status: 401 }) },
    async () => {
      await assert.rejects(search(), (error: unknown) => {
        assert.ok(error instanceof SearchError);
        assert.equal(error.statusCode, 401);
        assert.match(error.hint ?? "", /Coding Plan key/);
        assert.ok(!error.message.includes(KEY));
        return true;
      });
    },
  );
});

test("MCP RPC errors hide remote response bodies", async () => {
  await withBackend(
    {
      onCall: (message) =>
        new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            id: message.id,
            error: { code: -32603, message: `Remote error ${KEY}` },
          }),
          { headers: { "Content-Type": "application/json" } },
        ),
    },
    async () => {
      await assert.rejects(
        search(),
        (error: unknown) => error instanceof SearchError && !error.message.includes(KEY),
      );
    },
  );
});

test("MCP cancellation aborts the request and still cleans up", async () => {
  const controller = new AbortController();
  await withBackend(
    {
      onCall: (_message, signal) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(signal.reason), { once: true });
          controller.abort();
        }),
    },
    async (requests) => {
      await assert.rejects(
        search(controller.signal),
        (error: unknown) => error instanceof Error && error.name === "AbortError",
      );
      assert.ok(requests.some((r) => r.method === "DELETE"));
    },
  );
});

test("MCP branch performs no requests when already cancelled", async () => {
  await withBackend({}, async (requests) => {
    await assert.rejects(search(AbortSignal.abort()), { name: "AbortError" });
    assert.equal(requests.length, 0);
  });
});

test("MCP cleanup failure preserves success and search errors", async () => {
  await withBackend({ cleanupStatus: 500 }, async () => {
    assert.equal((await search()).length, 1);
  });
  await withBackend({ cleanupStatus: 500, isError: true }, async () => {
    await assert.rejects(search(), /tool returned an error/);
  });
});
