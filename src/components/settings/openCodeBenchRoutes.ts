// Échantillon RÉEL du catalogue opencode (capturé le 2026-08-24 depuis le
// sidecar Rust : 646 routes, 8 passerelles, 474 modèles distincts dont 118
// multi-routes). Réduit à 129 routes pour rester lisible en diff, en gardant
// TOUS les cas qui comptent visuellement : les 8 passerelles, les modèles à
// plusieurs routes, les identifiants à plus de deux segments
// (fireworks-ai/accounts/…) et les routes gratuites. Sert UNIQUEMENT au banc
// visuel (VITE_VISUAL_BENCH=1, #setbench-opencode) — jamais au runtime.
// Aucune donnée personnelle : ce sont des noms de modèles publics.
import type { ProviderCatalogRow } from "./shared";

export const OPENCODE_BENCH_ROUTES: NonNullable<ProviderCatalogRow["routes"]> = [
  {
    "id": "google/gemini-2.5-flash",
    "gateway": "google",
    "vendor": null,
    "leaf": "gemini-2.5-flash",
    "free": false
  },
  {
    "id": "google/gemini-2.5-flash-image",
    "gateway": "google",
    "vendor": null,
    "leaf": "gemini-2.5-flash-image",
    "free": false
  },
  {
    "id": "google/gemini-2.5-flash-lite",
    "gateway": "google",
    "vendor": null,
    "leaf": "gemini-2.5-flash-lite",
    "free": false
  },
  {
    "id": "google/gemini-2.5-pro",
    "gateway": "google",
    "vendor": null,
    "leaf": "gemini-2.5-pro",
    "free": false
  },
  {
    "id": "google/gemini-3-flash-preview",
    "gateway": "google",
    "vendor": null,
    "leaf": "gemini-3-flash-preview",
    "free": false
  },
  {
    "id": "google/gemini-3-pro-image",
    "gateway": "google",
    "vendor": null,
    "leaf": "gemini-3-pro-image",
    "free": false
  },
  {
    "id": "google/gemini-3-pro-image-preview",
    "gateway": "google",
    "vendor": null,
    "leaf": "gemini-3-pro-image-preview",
    "free": false
  },
  {
    "id": "google/gemini-3.1-flash-image",
    "gateway": "google",
    "vendor": null,
    "leaf": "gemini-3.1-flash-image",
    "free": false
  },
  {
    "id": "google/gemini-3.1-flash-image-preview",
    "gateway": "google",
    "vendor": null,
    "leaf": "gemini-3.1-flash-image-preview",
    "free": false
  },
  {
    "id": "google/gemini-3.1-flash-lite",
    "gateway": "google",
    "vendor": null,
    "leaf": "gemini-3.1-flash-lite",
    "free": false
  },
  {
    "id": "google/gemini-3.1-flash-lite-image",
    "gateway": "google",
    "vendor": null,
    "leaf": "gemini-3.1-flash-lite-image",
    "free": false
  },
  {
    "id": "google/gemini-3.1-pro-preview",
    "gateway": "google",
    "vendor": null,
    "leaf": "gemini-3.1-pro-preview",
    "free": false
  },
  {
    "id": "google/gemini-3.1-pro-preview-customtools",
    "gateway": "google",
    "vendor": null,
    "leaf": "gemini-3.1-pro-preview-customtools",
    "free": false
  },
  {
    "id": "google/gemini-3.5-flash",
    "gateway": "google",
    "vendor": null,
    "leaf": "gemini-3.5-flash",
    "free": false
  },
  {
    "id": "google/gemini-3.5-flash-lite",
    "gateway": "google",
    "vendor": null,
    "leaf": "gemini-3.5-flash-lite",
    "free": false
  },
  {
    "id": "google/gemini-3.6-flash",
    "gateway": "google",
    "vendor": null,
    "leaf": "gemini-3.6-flash",
    "free": false
  },
  {
    "id": "google/gemini-3.7-flash",
    "gateway": "google",
    "vendor": null,
    "leaf": "gemini-3.7-flash",
    "free": false
  },
  {
    "id": "google/gemini-flash-latest",
    "gateway": "google",
    "vendor": null,
    "leaf": "gemini-flash-latest",
    "free": false
  },
  {
    "id": "google/gemma-4-26b-a4b-it",
    "gateway": "google",
    "vendor": null,
    "leaf": "gemma-4-26b-a4b-it",
    "free": false
  },
  {
    "id": "google/gemma-4-31b-it",
    "gateway": "google",
    "vendor": null,
    "leaf": "gemma-4-31b-it",
    "free": false
  },
  {
    "id": "google/lyria-3-clip-preview",
    "gateway": "google",
    "vendor": null,
    "leaf": "lyria-3-clip-preview",
    "free": false
  },
  {
    "id": "google/lyria-3-pro-preview",
    "gateway": "google",
    "vendor": null,
    "leaf": "lyria-3-pro-preview",
    "free": false
  },
  {
    "id": "openai/gpt-5.3-codex-spark",
    "gateway": "openai",
    "vendor": null,
    "leaf": "gpt-5.3-codex-spark",
    "free": false
  },
  {
    "id": "openai/gpt-5.4",
    "gateway": "openai",
    "vendor": null,
    "leaf": "gpt-5.4",
    "free": false
  },
  {
    "id": "openai/gpt-5.4-mini",
    "gateway": "openai",
    "vendor": null,
    "leaf": "gpt-5.4-mini",
    "free": false
  },
  {
    "id": "openai/gpt-5.5",
    "gateway": "openai",
    "vendor": null,
    "leaf": "gpt-5.5",
    "free": false
  },
  {
    "id": "openai/gpt-5.6-luna",
    "gateway": "openai",
    "vendor": null,
    "leaf": "gpt-5.6-luna",
    "free": false
  },
  {
    "id": "openai/gpt-5.6-sol",
    "gateway": "openai",
    "vendor": null,
    "leaf": "gpt-5.6-sol",
    "free": false
  },
  {
    "id": "openai/gpt-5.6-terra",
    "gateway": "openai",
    "vendor": null,
    "leaf": "gpt-5.6-terra",
    "free": false
  },
  {
    "id": "opencode-go/deepseek-v4-flash",
    "gateway": "opencode-go",
    "vendor": null,
    "leaf": "deepseek-v4-flash",
    "free": false
  },
  {
    "id": "opencode-go/deepseek-v4-flash-vision-exp",
    "gateway": "opencode-go",
    "vendor": null,
    "leaf": "deepseek-v4-flash-vision-exp",
    "free": false
  },
  {
    "id": "opencode-go/deepseek-v4-pro",
    "gateway": "opencode-go",
    "vendor": null,
    "leaf": "deepseek-v4-pro",
    "free": false
  },
  {
    "id": "opencode-go/glm-5.1",
    "gateway": "opencode-go",
    "vendor": null,
    "leaf": "glm-5.1",
    "free": false
  },
  {
    "id": "opencode-go/glm-5.2",
    "gateway": "opencode-go",
    "vendor": null,
    "leaf": "glm-5.2",
    "free": false
  },
  {
    "id": "opencode-go/glm-5.3",
    "gateway": "opencode-go",
    "vendor": null,
    "leaf": "glm-5.3",
    "free": false
  },
  {
    "id": "opencode-go/gpt-5.6-luna",
    "gateway": "opencode-go",
    "vendor": null,
    "leaf": "gpt-5.6-luna",
    "free": false
  },
  {
    "id": "opencode-go/grok-4.5",
    "gateway": "opencode-go",
    "vendor": null,
    "leaf": "grok-4.5",
    "free": false
  },
  {
    "id": "opencode-go/hy3",
    "gateway": "opencode-go",
    "vendor": null,
    "leaf": "hy3",
    "free": false
  },
  {
    "id": "opencode-go/kimi-k2.6",
    "gateway": "opencode-go",
    "vendor": null,
    "leaf": "kimi-k2.6",
    "free": false
  },
  {
    "id": "opencode-go/kimi-k2.7-code",
    "gateway": "opencode-go",
    "vendor": null,
    "leaf": "kimi-k2.7-code",
    "free": false
  },
  {
    "id": "opencode-go/kimi-k3",
    "gateway": "opencode-go",
    "vendor": null,
    "leaf": "kimi-k3",
    "free": false
  },
  {
    "id": "opencode-go/longcat-2.0",
    "gateway": "opencode-go",
    "vendor": null,
    "leaf": "longcat-2.0",
    "free": false
  },
  {
    "id": "opencode-go/mimo-v2.5",
    "gateway": "opencode-go",
    "vendor": null,
    "leaf": "mimo-v2.5",
    "free": false
  },
  {
    "id": "opencode-go/mimo-v2.5-pro",
    "gateway": "opencode-go",
    "vendor": null,
    "leaf": "mimo-v2.5-pro",
    "free": false
  },
  {
    "id": "opencode-go/minimax-m2.7",
    "gateway": "opencode-go",
    "vendor": null,
    "leaf": "minimax-m2.7",
    "free": false
  },
  {
    "id": "opencode-go/minimax-m3",
    "gateway": "opencode-go",
    "vendor": null,
    "leaf": "minimax-m3",
    "free": false
  },
  {
    "id": "opencode-go/muse-spark-1.2-contributor",
    "gateway": "opencode-go",
    "vendor": null,
    "leaf": "muse-spark-1.2-contributor",
    "free": false
  },
  {
    "id": "opencode-go/ox-alpha-free",
    "gateway": "opencode-go",
    "vendor": null,
    "leaf": "ox-alpha",
    "free": true
  },
  {
    "id": "opencode-go/qwen3.6-plus",
    "gateway": "opencode-go",
    "vendor": null,
    "leaf": "qwen3.6-plus",
    "free": false
  },
  {
    "id": "opencode-go/qwen3.7-max",
    "gateway": "opencode-go",
    "vendor": null,
    "leaf": "qwen3.7-max",
    "free": false
  },
  {
    "id": "opencode-go/qwen3.7-plus",
    "gateway": "opencode-go",
    "vendor": null,
    "leaf": "qwen3.7-plus",
    "free": false
  },
  {
    "id": "opencode-go/qwen3.8-max",
    "gateway": "opencode-go",
    "vendor": null,
    "leaf": "qwen3.8-max",
    "free": false
  },
  {
    "id": "opencode/claude-fable-5",
    "gateway": "opencode",
    "vendor": null,
    "leaf": "claude-fable-5",
    "free": false
  },
  {
    "id": "opencode/claude-opus-5",
    "gateway": "opencode",
    "vendor": null,
    "leaf": "claude-opus-5",
    "free": false
  },
  {
    "id": "opencode/claude-sonnet-4",
    "gateway": "opencode",
    "vendor": null,
    "leaf": "claude-sonnet-4",
    "free": false
  },
  {
    "id": "opencode/claude-sonnet-5",
    "gateway": "opencode",
    "vendor": null,
    "leaf": "claude-sonnet-5",
    "free": false
  },
  {
    "id": "opencode/deepseek-v4-flash",
    "gateway": "opencode",
    "vendor": null,
    "leaf": "deepseek-v4-flash",
    "free": false
  },
  {
    "id": "opencode/deepseek-v4-pro",
    "gateway": "opencode",
    "vendor": null,
    "leaf": "deepseek-v4-pro",
    "free": false
  },
  {
    "id": "opencode/gemini-3-flash",
    "gateway": "opencode",
    "vendor": null,
    "leaf": "gemini-3-flash",
    "free": false
  },
  {
    "id": "opencode/gemini-3.1-pro",
    "gateway": "opencode",
    "vendor": null,
    "leaf": "gemini-3.1-pro",
    "free": false
  },
  {
    "id": "opencode/gemini-3.5-flash",
    "gateway": "opencode",
    "vendor": null,
    "leaf": "gemini-3.5-flash",
    "free": false
  },
  {
    "id": "opencode/gemini-3.5-flash-lite",
    "gateway": "opencode",
    "vendor": null,
    "leaf": "gemini-3.5-flash-lite",
    "free": false
  },
  {
    "id": "opencode/gemini-3.6-flash",
    "gateway": "opencode",
    "vendor": null,
    "leaf": "gemini-3.6-flash",
    "free": false
  },
  {
    "id": "opencode/gemini-3.7-flash",
    "gateway": "opencode",
    "vendor": null,
    "leaf": "gemini-3.7-flash",
    "free": false
  },
  {
    "id": "opencode/glm-5",
    "gateway": "opencode",
    "vendor": null,
    "leaf": "glm-5",
    "free": false
  },
  {
    "id": "opencode/glm-5.1",
    "gateway": "opencode",
    "vendor": null,
    "leaf": "glm-5.1",
    "free": false
  },
  {
    "id": "opencode/glm-5.2",
    "gateway": "opencode",
    "vendor": null,
    "leaf": "glm-5.2",
    "free": false
  },
  {
    "id": "opencode/gpt-5",
    "gateway": "opencode",
    "vendor": null,
    "leaf": "gpt-5",
    "free": false
  },
  {
    "id": "opencode/gpt-5-codex",
    "gateway": "opencode",
    "vendor": null,
    "leaf": "gpt-5-codex",
    "free": false
  },
  {
    "id": "opencode/gpt-5-nano",
    "gateway": "opencode",
    "vendor": null,
    "leaf": "gpt-5-nano",
    "free": false
  },
  {
    "id": "fireworks-ai/accounts/fireworks/models/deepseek-v4-flash",
    "gateway": "fireworks-ai",
    "vendor": "accounts",
    "leaf": "fireworks/models/deepseek-v4-flash",
    "free": false
  },
  {
    "id": "fireworks-ai/accounts/fireworks/models/deepseek-v4-flash-0731",
    "gateway": "fireworks-ai",
    "vendor": "accounts",
    "leaf": "fireworks/models/deepseek-v4-flash-0731",
    "free": false
  },
  {
    "id": "fireworks-ai/accounts/fireworks/models/deepseek-v4-pro",
    "gateway": "fireworks-ai",
    "vendor": "accounts",
    "leaf": "fireworks/models/deepseek-v4-pro",
    "free": false
  },
  {
    "id": "fireworks-ai/accounts/fireworks/models/deepseek-v4-pro-0813",
    "gateway": "fireworks-ai",
    "vendor": "accounts",
    "leaf": "fireworks/models/deepseek-v4-pro-0813",
    "free": false
  },
  {
    "id": "kimi-for-coding/k3",
    "gateway": "kimi-for-coding",
    "vendor": null,
    "leaf": "k3",
    "free": false
  },
  {
    "id": "kimi-for-coding/k3-256k",
    "gateway": "kimi-for-coding",
    "vendor": null,
    "leaf": "k3-256k",
    "free": false
  },
  {
    "id": "kimi-for-coding/kimi-for-coding",
    "gateway": "kimi-for-coding",
    "vendor": null,
    "leaf": "kimi-for-coding",
    "free": false
  },
  {
    "id": "kimi-for-coding/kimi-for-coding-highspeed",
    "gateway": "kimi-for-coding",
    "vendor": null,
    "leaf": "kimi-for-coding-highspeed",
    "free": false
  },
  {
    "id": "openrouter/~anthropic/claude-fable-latest",
    "gateway": "openrouter",
    "vendor": "~anthropic",
    "leaf": "claude-fable-latest",
    "free": false
  },
  {
    "id": "openrouter/~anthropic/claude-haiku-latest",
    "gateway": "openrouter",
    "vendor": "~anthropic",
    "leaf": "claude-haiku-latest",
    "free": false
  },
  {
    "id": "openrouter/~anthropic/claude-opus-latest",
    "gateway": "openrouter",
    "vendor": "~anthropic",
    "leaf": "claude-opus-latest",
    "free": false
  },
  {
    "id": "openrouter/~anthropic/claude-sonnet-latest",
    "gateway": "openrouter",
    "vendor": "~anthropic",
    "leaf": "claude-sonnet-latest",
    "free": false
  },
  {
    "id": "poe/anthropic/claude-haiku-3",
    "gateway": "poe",
    "vendor": "anthropic",
    "leaf": "claude-haiku-3",
    "free": false
  },
  {
    "id": "poe/anthropic/claude-haiku-3.5",
    "gateway": "poe",
    "vendor": "anthropic",
    "leaf": "claude-haiku-3.5",
    "free": false
  },
  {
    "id": "poe/anthropic/claude-haiku-4.5",
    "gateway": "poe",
    "vendor": "anthropic",
    "leaf": "claude-haiku-4.5",
    "free": false
  },
  {
    "id": "poe/anthropic/claude-opus-4",
    "gateway": "poe",
    "vendor": "anthropic",
    "leaf": "claude-opus-4",
    "free": false
  },
  {
    "id": "fireworks-ai/accounts/fireworks/models/glm-5p2",
    "gateway": "fireworks-ai",
    "vendor": "accounts",
    "leaf": "fireworks/models/glm-5p2",
    "free": false
  },
  {
    "id": "fireworks-ai/accounts/fireworks/models/gpt-oss-120b",
    "gateway": "fireworks-ai",
    "vendor": "accounts",
    "leaf": "fireworks/models/gpt-oss-120b",
    "free": false
  },
  {
    "id": "fireworks-ai/accounts/fireworks/models/gpt-oss-20b",
    "gateway": "fireworks-ai",
    "vendor": "accounts",
    "leaf": "fireworks/models/gpt-oss-20b",
    "free": false
  },
  {
    "id": "fireworks-ai/accounts/fireworks/models/inkling",
    "gateway": "fireworks-ai",
    "vendor": "accounts",
    "leaf": "fireworks/models/inkling",
    "free": false
  },
  {
    "id": "fireworks-ai/accounts/fireworks/models/kimi-k2p6",
    "gateway": "fireworks-ai",
    "vendor": "accounts",
    "leaf": "fireworks/models/kimi-k2p6",
    "free": false
  },
  {
    "id": "fireworks-ai/accounts/fireworks/models/kimi-k2p7-code",
    "gateway": "fireworks-ai",
    "vendor": "accounts",
    "leaf": "fireworks/models/kimi-k2p7-code",
    "free": false
  },
  {
    "id": "fireworks-ai/accounts/fireworks/models/kimi-k3",
    "gateway": "fireworks-ai",
    "vendor": "accounts",
    "leaf": "fireworks/models/kimi-k3",
    "free": false
  },
  {
    "id": "fireworks-ai/accounts/fireworks/models/minimax-m2p7",
    "gateway": "fireworks-ai",
    "vendor": "accounts",
    "leaf": "fireworks/models/minimax-m2p7",
    "free": false
  },
  {
    "id": "fireworks-ai/accounts/fireworks/models/minimax-m3",
    "gateway": "fireworks-ai",
    "vendor": "accounts",
    "leaf": "fireworks/models/minimax-m3",
    "free": false
  },
  {
    "id": "fireworks-ai/accounts/fireworks/models/muse-glimmer-30b",
    "gateway": "fireworks-ai",
    "vendor": "accounts",
    "leaf": "fireworks/models/muse-glimmer-30b",
    "free": false
  },
  {
    "id": "fireworks-ai/accounts/fireworks/models/nemotron-3-ultra-nvfp4",
    "gateway": "fireworks-ai",
    "vendor": "accounts",
    "leaf": "fireworks/models/nemotron-3-ultra-nvfp4",
    "free": false
  },
  {
    "id": "fireworks-ai/accounts/fireworks/models/nemotron-lightning-3p5-30b-a3b",
    "gateway": "fireworks-ai",
    "vendor": "accounts",
    "leaf": "fireworks/models/nemotron-lightning-3p5-30b-a3b",
    "free": false
  },
  {
    "id": "fireworks-ai/accounts/fireworks/models/qwen3p7-plus",
    "gateway": "fireworks-ai",
    "vendor": "accounts",
    "leaf": "fireworks/models/qwen3p7-plus",
    "free": false
  },
  {
    "id": "fireworks-ai/accounts/fireworks/models/qwen3p8-max",
    "gateway": "fireworks-ai",
    "vendor": "accounts",
    "leaf": "fireworks/models/qwen3p8-max",
    "free": false
  },
  {
    "id": "fireworks-ai/accounts/fireworks/routers/glm-5p2-fast",
    "gateway": "fireworks-ai",
    "vendor": "accounts",
    "leaf": "fireworks/routers/glm-5p2-fast",
    "free": false
  },
  {
    "id": "fireworks-ai/accounts/fireworks/routers/kimi-k2p6-fast",
    "gateway": "fireworks-ai",
    "vendor": "accounts",
    "leaf": "fireworks/routers/kimi-k2p6-fast",
    "free": false
  },
  {
    "id": "fireworks-ai/accounts/fireworks/routers/kimi-k2p6-turbo",
    "gateway": "fireworks-ai",
    "vendor": "accounts",
    "leaf": "fireworks/routers/kimi-k2p6-turbo",
    "free": false
  },
  {
    "id": "fireworks-ai/accounts/fireworks/routers/kimi-k2p7-code-fast",
    "gateway": "fireworks-ai",
    "vendor": "accounts",
    "leaf": "fireworks/routers/kimi-k2p7-code-fast",
    "free": false
  },
  {
    "id": "fireworks-ai/accounts/fireworks/routers/kimi-k3-fast",
    "gateway": "fireworks-ai",
    "vendor": "accounts",
    "leaf": "fireworks/routers/kimi-k3-fast",
    "free": false
  },
  {
    "id": "opencode/hy3-free",
    "gateway": "opencode",
    "vendor": null,
    "leaf": "hy3",
    "free": true
  },
  {
    "id": "opencode/mimo-v2.5-free",
    "gateway": "opencode",
    "vendor": null,
    "leaf": "mimo-v2.5",
    "free": true
  },
  {
    "id": "opencode/muse-spark-1.2-contributor-free",
    "gateway": "opencode",
    "vendor": null,
    "leaf": "muse-spark-1.2-contributor",
    "free": true
  },
  {
    "id": "opencode/nemotron-3-ultra-free",
    "gateway": "opencode",
    "vendor": null,
    "leaf": "nemotron-3-ultra",
    "free": true
  },
  {
    "id": "opencode/nemotron-3.5-lightning-free",
    "gateway": "opencode",
    "vendor": null,
    "leaf": "nemotron-3.5-lightning",
    "free": true
  },
  {
    "id": "opencode/x-preview-f-free",
    "gateway": "opencode",
    "vendor": null,
    "leaf": "x-preview-f",
    "free": true
  },
  {
    "id": "openrouter/cohere/north-mini-code:free",
    "gateway": "openrouter",
    "vendor": "cohere",
    "leaf": "north-mini-code",
    "free": true
  },
  {
    "id": "openrouter/dots-studio/dots-3-note-preview:free",
    "gateway": "openrouter",
    "vendor": "dots-studio",
    "leaf": "dots-3-note-preview",
    "free": true
  },
  {
    "id": "openrouter/google/gemma-4-26b-a4b-it:free",
    "gateway": "openrouter",
    "vendor": "google",
    "leaf": "gemma-4-26b-a4b-it",
    "free": true
  },
  {
    "id": "openrouter/google/gemma-4-31b-it:free",
    "gateway": "openrouter",
    "vendor": "google",
    "leaf": "gemma-4-31b-it",
    "free": true
  },
  {
    "id": "openrouter/liquid/lfm-2.5-2.6b:free",
    "gateway": "openrouter",
    "vendor": "liquid",
    "leaf": "lfm-2.5-2.6b",
    "free": true
  },
  {
    "id": "openrouter/nvidia/nemotron-3-nano-30b-a3b:free",
    "gateway": "openrouter",
    "vendor": "nvidia",
    "leaf": "nemotron-3-nano-30b-a3b",
    "free": true
  },
  {
    "id": "openrouter/nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
    "gateway": "openrouter",
    "vendor": "nvidia",
    "leaf": "nemotron-3-nano-omni-30b-a3b-reasoning",
    "free": true
  },
  {
    "id": "openrouter/nvidia/nemotron-3-super-120b-a12b:free",
    "gateway": "openrouter",
    "vendor": "nvidia",
    "leaf": "nemotron-3-super-120b-a12b",
    "free": true
  },
  {
    "id": "openrouter/nvidia/nemotron-3-ultra-550b-a55b:free",
    "gateway": "openrouter",
    "vendor": "nvidia",
    "leaf": "nemotron-3-ultra-550b-a55b",
    "free": true
  },
  {
    "id": "openrouter/nvidia/nemotron-3.5-content-safety:free",
    "gateway": "openrouter",
    "vendor": "nvidia",
    "leaf": "nemotron-3.5-content-safety",
    "free": true
  },
  {
    "id": "openrouter/nvidia/nemotron-3.5-lightning:free",
    "gateway": "openrouter",
    "vendor": "nvidia",
    "leaf": "nemotron-3.5-lightning",
    "free": true
  },
  {
    "id": "openrouter/nvidia/nemotron-nano-12b-v2-vl:free",
    "gateway": "openrouter",
    "vendor": "nvidia",
    "leaf": "nemotron-nano-12b-v2-vl",
    "free": true
  },
  {
    "id": "openrouter/nvidia/nemotron-nano-9b-v2:free",
    "gateway": "openrouter",
    "vendor": "nvidia",
    "leaf": "nemotron-nano-9b-v2",
    "free": true
  },
  {
    "id": "openrouter/poolside/laguna-s-2.1:free",
    "gateway": "openrouter",
    "vendor": "poolside",
    "leaf": "laguna-s-2.1",
    "free": true
  },
  {
    "id": "openrouter/poolside/laguna-xs-2.1:free",
    "gateway": "openrouter",
    "vendor": "poolside",
    "leaf": "laguna-xs-2.1",
    "free": true
  },
  {
    "id": "openrouter/thinkingmachines/inkling-small:free",
    "gateway": "openrouter",
    "vendor": "thinkingmachines",
    "leaf": "inkling-small",
    "free": true
  },
  {
    "id": "openrouter/thinkingmachines/inkling:free",
    "gateway": "openrouter",
    "vendor": "thinkingmachines",
    "leaf": "inkling",
    "free": true
  },
  {
    "id": "openrouter/z-ai/glm-5.2:free",
    "gateway": "openrouter",
    "vendor": "z-ai",
    "leaf": "glm-5.2",
    "free": true
  }
];
