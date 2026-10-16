# opencode-qsearch

OpenCode V2 plugin that registers web search providers (`zhipu` and `brave`) into OpenCode's native web search system via `ctx.websearch.transform`.

## Features

- Native OpenCode V2 websearch provider registration.
- **Zhipu**: Official Web Search endpoint, search engine selection (`search_std`, `search_pro`, etc.).
- **Brave Search**: Independent web search index, customizable safe search, language, country, and freshness filters.
- Seamless authentication fallback: plugin options (`{env:...}` supported), environment variables, or `/connect` integrations.

## Installation

Add to your `opencode.jsonc`:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": [
    "opencode-qsearch"
  ],
  "websearch": {
    "provider": "zhipu"
  }
}
```

Or configure provider-specific options:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": [
    {
      "package": "opencode-qsearch",
      "options": {
        "provider": "zhipu",
        "zhipu": {
          "apiKey": "{env:ZHIPU_API_KEY}",
          "searchEngine": "search_std",
          "count": 10
        },
        "brave": {
          "apiKey": "{env:BRAVE_SEARCH_API_KEY}",
          "count": 10,
          "safesearch": "moderate"
        }
      }
    }
  ],
  "websearch": {
    "provider": "zhipu"
  }
}
```

## Authentication

### Zhipu
1. `options.zhipu.apiKey` (supports `{env:VAR_NAME}`)
2. `ZHIPU_API_KEY` environment variable
3. Connected `/connect` account for `zhipuai` or `zai`

### Brave Search
1. `options.brave.apiKey` (supports `{env:VAR_NAME}`)
2. `BRAVE_SEARCH_API_KEY` or `BRAVE_API_KEY` environment variable
3. Connected `/connect` account for `brave`

## Options Reference

| Option | Type | Default | Description |
|---|---|---|---|
| `provider` | `"zhipu" \| "brave"` | `undefined` | Sets default websearch provider if specified |
| `zhipu.apiKey` | `string` | `undefined` | API key or `{env:VAR}` |
| `zhipu.searchEngine` | `"search_std" \| "search_pro" \| "search_pro_sogou" \| "search_pro_quark"` | `"search_std"` | Zhipu search engine model |
| `zhipu.count` | `number` (1-50) | `8` | Number of results |
| `brave.apiKey` | `string` | `undefined` | Brave subscription token or `{env:VAR}` |
| `brave.count` | `number` (1-20) | `8` | Number of results |
| `brave.country` | `string` | `undefined` | 2-letter country code |
| `brave.searchLang` | `string` | `undefined` | Language code |
| `brave.safesearch` | `"off" \| "moderate" \| "strict"` | `undefined` | SafeSearch filter level |
| `brave.freshness` | `string` | `undefined` | Time filter (`pd`, `pw`, `pm`, `py`, or custom range) |
