import assert from "node:assert/strict";
import test from "node:test";
import { resolveBraveApiKey } from "../src/brave.js";
import { AuthError } from "../src/errors.js";
import { resolveZhipuApiKey } from "../src/zhipu.js";

test("resolveZhipuApiKey resolves via config, env, and integration", async () => {
  const prevEnv = process.env.ZHIPU_API_KEY;
  delete process.env.ZHIPU_API_KEY;

  try {
    const fromConfig = await resolveZhipuApiKey("config-key");
    assert.equal(fromConfig, "config-key");

    process.env.ZHIPU_API_KEY = "env-key";
    const fromEnv = await resolveZhipuApiKey(undefined);
    assert.equal(fromEnv, "env-key");

    delete process.env.ZHIPU_API_KEY;
    const fromFallback = await resolveZhipuApiKey(undefined, async () => "fallback-key");
    assert.equal(fromFallback, "fallback-key");

    await assert.rejects(
      async () => {
        await resolveZhipuApiKey(undefined, async () => undefined);
      },
      (err: unknown) => err instanceof AuthError,
    );
  } finally {
    if (prevEnv) process.env.ZHIPU_API_KEY = prevEnv;
    else delete process.env.ZHIPU_API_KEY;
  }
});

test("resolveBraveApiKey resolves via config, env, and integration", async () => {
  const prevSearch = process.env.BRAVE_SEARCH_API_KEY;
  const prevBrave = process.env.BRAVE_API_KEY;
  delete process.env.BRAVE_SEARCH_API_KEY;
  delete process.env.BRAVE_API_KEY;

  try {
    const fromConfig = await resolveBraveApiKey("b-config");
    assert.equal(fromConfig, "b-config");

    process.env.BRAVE_SEARCH_API_KEY = "b-search-env";
    const fromSearchEnv = await resolveBraveApiKey(undefined);
    assert.equal(fromSearchEnv, "b-search-env");

    delete process.env.BRAVE_SEARCH_API_KEY;
    process.env.BRAVE_API_KEY = "b-env";
    const fromBraveEnv = await resolveBraveApiKey(undefined);
    assert.equal(fromBraveEnv, "b-env");

    delete process.env.BRAVE_API_KEY;
    const fromFallback = await resolveBraveApiKey(undefined, async () => "b-fallback");
    assert.equal(fromFallback, "b-fallback");

    await assert.rejects(
      async () => {
        await resolveBraveApiKey(undefined, async () => undefined);
      },
      (err: unknown) => err instanceof AuthError,
    );
  } finally {
    if (prevSearch) process.env.BRAVE_SEARCH_API_KEY = prevSearch;
    else delete process.env.BRAVE_SEARCH_API_KEY;
    if (prevBrave) process.env.BRAVE_API_KEY = prevBrave;
    else delete process.env.BRAVE_API_KEY;
  }
});
