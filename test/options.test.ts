import assert from "node:assert/strict";
import test from "node:test";
import { parsePluginOptions, resolveEnvTemplate } from "../src/options.js";
import { parsePublishedTimestamp } from "../src/types.js";

test("resolveEnvTemplate handles plain values and env references", () => {
  assert.equal(resolveEnvTemplate(undefined), undefined);
  assert.equal(resolveEnvTemplate(""), undefined);
  assert.equal(resolveEnvTemplate("plain-key"), "plain-key");

  process.env.TEST_OPCODE_KEY = "resolved-secret";
  assert.equal(resolveEnvTemplate("{env:TEST_OPCODE_KEY}"), "resolved-secret");
  assert.equal(resolveEnvTemplate("{env:NON_EXISTENT_VAR_12345}"), undefined);
});

test("parsePluginOptions sets defaults correctly", () => {
  const options = parsePluginOptions({});
  assert.equal(options.provider, undefined);
  assert.equal(options.zhipu.searchEngine, "search_std");
  assert.equal(options.zhipu.count, 8);
  assert.equal(options.brave.count, 8);
});

test("parsePluginOptions parses custom config", () => {
  const options = parsePluginOptions({
    provider: "brave",
    zhipu: {
      apiKey: "z-key",
      searchEngine: "search_pro",
      count: 20,
    },
    brave: {
      apiKey: "b-key",
      count: 5,
      safesearch: "strict",
      country: "US",
    },
  });

  assert.equal(options.provider, "brave");
  assert.equal(options.zhipu.apiKey, "z-key");
  assert.equal(options.zhipu.searchEngine, "search_pro");
  assert.equal(options.zhipu.count, 20);
  assert.equal(options.brave.apiKey, "b-key");
  assert.equal(options.brave.count, 5);
  assert.equal(options.brave.safesearch, "strict");
  assert.equal(options.brave.country, "US");
});

test("parsePublishedTimestamp parses dates and rejects invalid values", () => {
  assert.equal(parsePublishedTimestamp(undefined), undefined);
  assert.equal(parsePublishedTimestamp(""), undefined);
  assert.equal(parsePublishedTimestamp("invalid-date-string"), undefined);

  const parsed = parsePublishedTimestamp("2026-03-01T12:00:00Z");
  assert.ok(typeof parsed === "number");
  assert.ok(parsed > 0);
});
