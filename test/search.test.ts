import assert from "node:assert/strict";
import test from "node:test";
import { braveSearch } from "../src/brave.js";
import { zhipuSearch } from "../src/zhipu.js";

test("zhipuSearch maps API response items to SearchResultItem", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    assert.match(String(input), /open\.bigmodel\.cn\/api\/paas\/v4\/web_search/);
    assert.equal(init?.method, "POST");
    const headers = init?.headers as Record<string, string>;
    assert.equal(headers.Authorization, "Bearer mock-zhipu-token");

    const body = JSON.parse(String(init?.body));
    assert.equal(body.search_query, "OpenCode V2");
    assert.equal(body.search_engine, "search_std");

    return new Response(
      JSON.stringify({
        search_result: [
          {
            title: "OpenCode Documentation",
            content: "Official V2 docs",
            link: "https://opencode.ai/docs",
            publish_date: "2026-02-15T08:00:00Z",
          },
          {
            title: "Empty Link Result",
            content: "No link",
          },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }) as typeof fetch;

  try {
    const results = await zhipuSearch("mock-zhipu-token", "OpenCode V2", {
      searchEngine: "search_std",
      coding: false,
    });

    assert.equal(results.length, 1);
    assert.equal(results[0].url, "https://opencode.ai/docs");
    assert.equal(results[0].title, "OpenCode Documentation");
    assert.equal(results[0].content, "Official V2 docs");
    assert.equal(results[0].time.published, Date.parse("2026-02-15T08:00:00Z"));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("braveSearch maps API response items to SearchResultItem", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    assert.equal(url.searchParams.get("q"), "Brave Search API");
    assert.equal(url.searchParams.get("count"), "5");
    assert.equal(url.searchParams.get("safesearch"), "moderate");
    assert.equal(url.searchParams.get("text_decorations"), "false");

    const headers = init?.headers as Record<string, string>;
    assert.equal(headers["X-Subscription-Token"], "mock-brave-token");

    return new Response(
      JSON.stringify({
        web: {
          results: [
            {
              title: "Brave Search Portal",
              url: "https://search.brave.com",
              description: "Fast independent search",
              page_age: "2026-01-10T00:00:00Z",
            },
            {
              title: "Extra Snippet Result",
              url: "https://example.com/extra",
              extra_snippets: ["Snippet content"],
            },
          ],
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }) as typeof fetch;

  try {
    const results = await braveSearch("mock-brave-token", "Brave Search API", {
      count: 5,
      safesearch: "moderate",
    });

    assert.equal(results.length, 2);
    assert.equal(results[0].url, "https://search.brave.com");
    assert.equal(results[0].content, "Fast independent search");
    assert.equal(results[0].time.published, Date.parse("2026-01-10T00:00:00Z"));
    assert.equal(results[1].url, "https://example.com/extra");
    assert.equal(results[1].content, "Snippet content");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
