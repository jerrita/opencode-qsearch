import assert from "node:assert/strict";
import test from "node:test";
import { DEEPSEEK_SEARCH_URL, deepseekSearch, resolveDeepSeekApiKey } from "../src/deepseek.js";
import { AuthError, SearchError } from "../src/errors.js";
import { parsePluginOptions } from "../src/options.js";

test("DeepSeek options apply defaults and validate custom settings", () => {
  assert.deepEqual(parsePluginOptions({}).deepseek, {
    apiKey: undefined,
    count: 8,
    localization: undefined,
    needContent: false,
  });
  const options = parsePluginOptions({
    provider: "deepseek",
    deepseek: { apiKey: "synthetic-key", count: 50, localization: "192.0.2.1", needContent: true },
  });
  assert.equal(options.provider, "deepseek");
  assert.deepEqual(options.deepseek, {
    apiKey: "synthetic-key",
    count: 50,
    localization: "192.0.2.1",
    needContent: true,
  });
  for (const deepseek of [{ count: 0 }, { count: 51 }, { count: 1.5 }, { needContent: "true" }]) {
    assert.throws(() => parsePluginOptions({ deepseek }));
  }
});

test("DeepSeek authentication prefers config, then environment, then integration", async (t) => {
  const previous = process.env.DEEPSEEK_API_KEY;
  t.after(() => {
    if (previous === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = previous;
  });
  const fallback = t.mock.fn(async () => "synthetic-integration-key");
  process.env.DEEPSEEK_API_KEY = "synthetic-env-key";
  assert.equal(
    await resolveDeepSeekApiKey("synthetic-config-key", fallback),
    "synthetic-config-key",
  );
  assert.equal(
    await resolveDeepSeekApiKey("{env:DEEPSEEK_API_KEY}", fallback),
    "synthetic-env-key",
  );
  assert.equal(await resolveDeepSeekApiKey(undefined, fallback), "synthetic-env-key");
  assert.equal(fallback.mock.callCount(), 0);
  delete process.env.DEEPSEEK_API_KEY;
  assert.equal(await resolveDeepSeekApiKey(undefined, fallback), "synthetic-integration-key");
  await assert.rejects(
    resolveDeepSeekApiKey(undefined, async () => undefined),
    AuthError,
  );
});

test("DeepSeek search sends API fields and maps content, summaries, snippets and dates", async (t) => {
  const signal = new AbortController().signal;
  t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    assert.equal(String(input), DEEPSEEK_SEARCH_URL);
    assert.equal(init?.method, "POST");
    assert.equal(init?.signal, signal);
    const headers = new Headers(init?.headers);
    assert.equal(headers.get("authorization"), "Bearer synthetic-key");
    assert.equal(headers.get("content-type"), "application/json");
    assert.deepEqual(JSON.parse(String(init?.body)), {
      query: "Example documentation",
      count: 5,
      localization: "192.0.2.1",
      need_content: true,
    });
    return Response.json({
      results: [
        {
          url: "https://example.org/full",
          title: "Full page",
          content: "Page content",
          summary: "Long summary",
          snippet: "Short snippet",
          date: "2026-01-01T00:00:00+00:00",
        },
        { url: "https://example.org/summary", content: "", summary: "Long summary", date: null },
        {
          url: "https://example.org/snippet",
          summary: "",
          snippet: "Short snippet",
          date: "invalid",
        },
        { url: "https://example.org/empty" },
        { title: "Missing URL" },
      ],
    });
  });
  const config = parsePluginOptions({
    deepseek: { count: 5, localization: "192.0.2.1", needContent: true },
  }).deepseek;
  assert.deepEqual(await deepseekSearch("synthetic-key", "Example documentation", config, signal), [
    {
      url: "https://example.org/full",
      title: "Full page",
      content: "Page content",
      time: { published: Date.parse("2026-01-01T00:00:00Z") },
    },
    { url: "https://example.org/summary", content: "Long summary", time: {} },
    { url: "https://example.org/snippet", content: "Short snippet", time: {} },
    { url: "https://example.org/empty", time: {} },
  ]);
});

test("DeepSeek search sends defaults and accepts no results", async (t) => {
  t.mock.method(globalThis, "fetch", async (_input: RequestInfo | URL, init?: RequestInit) => {
    assert.deepEqual(JSON.parse(String(init?.body)), {
      query: "Example documentation",
      count: 8,
      need_content: false,
    });
    return Response.json({ results: [] });
  });
  assert.deepEqual(
    await deepseekSearch("synthetic-key", "Example documentation", parsePluginOptions({}).deepseek),
    [],
  );
});

test("DeepSeek search preserves API error status, message and actionable hints", async (t) => {
  for (const [status, hint] of [
    [401, /DEEPSEEK_API_KEY/],
    [402, /balance/],
    [429, /rate limit/],
  ] as const) {
    const mock = t.mock.method(globalThis, "fetch", async () =>
      Response.json({ error: { message: "Synthetic API error" } }, { status }),
    );
    await assert.rejects(
      deepseekSearch("synthetic-key", "Example documentation", parsePluginOptions({}).deepseek),
      (error: unknown) => {
        assert.ok(error instanceof SearchError);
        assert.equal(error.statusCode, status);
        assert.match(error.message, /Synthetic API error/);
        assert.match(error.hint ?? "", hint);
        return true;
      },
    );
    mock.mock.restore();
  }
});

test("DeepSeek search propagates cancellation", async (t) => {
  const controller = new AbortController();
  controller.abort();
  t.mock.method(globalThis, "fetch", async (_input: RequestInfo | URL, init?: RequestInit) => {
    assert.equal(init?.signal, controller.signal);
    init.signal.throwIfAborted();
  });
  await assert.rejects(
    deepseekSearch(
      "synthetic-key",
      "Example documentation",
      parsePluginOptions({}).deepseek,
      controller.signal,
    ),
    (error: unknown) => error instanceof Error && error.name === "AbortError",
  );
});
