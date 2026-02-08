import {
  defineModuleConfig,
  StorageJSONSchema,
  StorageProviderConfig,
} from '../../base';
import { CopilotPromptScenario } from './prompt/prompts';
import {
  AnthropicOfficialConfig,
  AnthropicVertexConfig,
} from './providers/anthropic';
import type { CustomProviderConfig } from './providers/custom';
import type { FalConfig } from './providers/fal';
import { GeminiGenerativeConfig, GeminiVertexConfig } from './providers/gemini';
import { MorphConfig } from './providers/morph';
import { OpenAIConfig } from './providers/openai';
import { PerplexityConfig } from './providers/perplexity';
import { VertexSchema } from './providers/types';
declare global {
  interface AppConfigSchema {
    copilot: {
      enabled: boolean;
      unsplash: ConfigItem<{
        key: string;
      }>;
      exa: ConfigItem<{
        key: string;
      }>;
      storage: ConfigItem<StorageProviderConfig>;
      scenarios: ConfigItem<CopilotPromptScenario>;
      providers: {
        openai: ConfigItem<OpenAIConfig>;
        custom: ConfigItem<CustomProviderConfig>;
        fal: ConfigItem<FalConfig>;
        gemini: ConfigItem<GeminiGenerativeConfig>;
        geminiVertex: ConfigItem<GeminiVertexConfig>;
        perplexity: ConfigItem<PerplexityConfig>;
        anthropic: ConfigItem<AnthropicOfficialConfig>;
        anthropicVertex: ConfigItem<AnthropicVertexConfig>;
        morph: ConfigItem<MorphConfig>;
      };
    };
  }
}

defineModuleConfig('copilot', {
  enabled: {
    desc: 'Whether to enable the copilot plugin. <br> Document: <a href="https://docs.affine.pro/self-host-affine/administer/ai" target="_blank">https://docs.affine.pro/self-host-affine/administer/ai</a>',
    default: false,
  },
  scenarios: {
    desc: 'Use custom models in scenarios and override default settings.',
    default: {
      override_enabled: false,
      scenarios: {
        audio_transcribing: 'gemini-2.5-flash',
        chat: 'gemini-2.5-flash',
        embedding: 'gemini-embedding-001',
        image: 'gpt-image-1',
        rerank: 'gpt-4.1',
        coding: 'claude-sonnet-4-5@20250929',
        complex_text_generation: 'gpt-4o-2024-08-06',
        quick_decision_making: 'gpt-5-mini',
        quick_text_generation: 'gemini-2.5-flash',
        polish_and_summarize: 'gemini-2.5-flash',
      },
    },
  },
  'providers.openai': {
    desc: 'The config for the openai provider.',
    default: {
      apiKey: '',
      baseURL: 'https://api.openai.com/v1',
    },
    link: 'https://github.com/openai/openai-node',
  },
  'providers.custom': {
    desc: 'The config for the custom OpenAI-compatible provider. Supports any OpenAI-compatible API (e.g., OpenRouter, Together AI, LocalAI, Ollama, vLLM, etc.).',
    default: {
      apiKey: '',
      baseURL: '',
      models: [],
      name: 'custom',
    },
    schema: {
      type: 'object',
      description:
        'Custom OpenAI-compatible provider configuration for self-hosted or third-party LLM services.',
      properties: {
        apiKey: {
          type: 'string',
          description: 'API key for authentication with the custom provider.',
        },
        baseURL: {
          type: 'string',
          description:
            'Base URL of the OpenAI-compatible API endpoint (e.g., http://localhost:11434/v1 for Ollama, https://openrouter.ai/api/v1 for OpenRouter).',
        },
        models: {
          type: 'array',
          items: { type: 'string' },
          description:
            'List of model IDs available from this provider. If not specified, the system will try to fetch available models from the /models endpoint.',
        },
        name: {
          type: 'string',
          description:
            'Optional name for this custom provider (for logging purposes).',
        },
      },
      required: ['apiKey', 'baseURL'],
    },
  },
  'providers.fal': {
    desc: 'The config for the fal provider.',
    default: {
      apiKey: '',
    },
  },
  'providers.gemini': {
    desc: 'The config for the gemini provider.',
    default: {
      apiKey: '',
      baseURL: 'https://generativelanguage.googleapis.com/v1beta',
    },
  },
  'providers.geminiVertex': {
    desc: 'The config for the gemini provider in Google Vertex AI.',
    default: {},
    schema: VertexSchema,
  },
  'providers.perplexity': {
    desc: 'The config for the perplexity provider.',
    default: {
      apiKey: '',
    },
  },
  'providers.anthropic': {
    desc: 'The config for the anthropic provider.',
    default: {
      apiKey: '',
      baseURL: 'https://api.anthropic.com/v1',
    },
  },
  'providers.anthropicVertex': {
    desc: 'The config for the anthropic provider in Google Vertex AI.',
    default: {},
    schema: VertexSchema,
  },
  'providers.morph': {
    desc: 'The config for the morph provider.',
    default: {},
  },
  unsplash: {
    desc: 'The config for the unsplash key.',
    default: {
      key: '',
    },
  },
  exa: {
    desc: 'The config for the exa web search key.',
    default: {
      key: '',
    },
  },
  storage: {
    desc: 'The config for the storage provider.',
    default: {
      provider: 'fs',
      bucket: 'copilot',
      config: {
        path: '~/.affine/storage',
      },
    },
    schema: StorageJSONSchema,
  },
});
