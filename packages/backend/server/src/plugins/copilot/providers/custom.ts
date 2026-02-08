import {
  createOpenAICompatible,
  type OpenAICompatibleProvider as VercelOpenAICompatibleProvider,
} from '@ai-sdk/openai-compatible';
import {
  AISDKError,
  embedMany,
  generateObject,
  generateText,
  stepCountIs,
  streamText,
} from 'ai';
import { z } from 'zod';

import {
  CopilotPromptInvalid,
  CopilotProviderNotSupported,
  CopilotProviderSideError,
  metrics,
  UserFriendlyError,
} from '../../../base';
import { CopilotProvider } from './provider';
import type {
  CopilotChatOptions,
  CopilotEmbeddingOptions,
  CopilotProviderModel,
  CopilotStructuredOptions,
  ModelConditions,
  PromptMessage,
  StreamObject,
} from './types';
import { CopilotProviderType, ModelInputType, ModelOutputType } from './types';
import { chatToGPTMessage, StreamObjectParser, TextStreamParser } from './utils';

export const DEFAULT_DIMENSIONS = 256;

export type CustomProviderConfig = {
  apiKey: string;
  baseURL: string;
  models?: string[];
  name?: string;
};

const ModelListSchema = z.object({
  data: z.array(z.object({ id: z.string() })),
});

export class CustomProvider extends CopilotProvider<CustomProviderConfig> {
  readonly type = CopilotProviderType.Custom;

  readonly models: CopilotProviderModel[] = [];

  #instance!: VercelOpenAICompatibleProvider;

  override configured(): boolean {
    return !!this.config.apiKey && !!this.config.baseURL;
  }

  protected override setup() {
    super.setup();
    if (this.configured()) {
      this.#instance = createOpenAICompatible({
        name: this.config.name || 'custom-openai-compatible',
        apiKey: this.config.apiKey,
        baseURL: this.config.baseURL,
      });
    }
  }

  private handleError(
    e: any,
    model: string,
    options: CopilotChatOptions = {}
  ): UserFriendlyError {
    if (e instanceof UserFriendlyError) {
      return e;
    } else if (e instanceof AISDKError && e.cause instanceof Error) {
      return this.handleError(e.cause, model, options);
    } else if (options?.signal?.aborted) {
      return new CopilotProviderSideError({
        provider: this.type,
        kind: 'aborted',
        message: 'Request aborted',
      });
    } else {
      return new CopilotProviderSideError({
        provider: this.type,
        kind: 'unexpected_response',
        message: e?.message || 'Unexpected response from custom provider',
      });
    }
  }

  override async refreshOnlineModels() {
    try {
      const baseUrl = this.config.baseURL;
      if (this.config.apiKey && baseUrl && !this.onlineModelList.length) {
        // If user has configured models explicitly, use them
        if (this.config.models?.length) {
          this.onlineModelList = this.config.models;
          return;
        }

        // Otherwise try to fetch from the API
        const response = await fetch(`${baseUrl}/models`, {
          headers: {
            Authorization: `Bearer ${this.config.apiKey}`,
            'Content-Type': 'application/json',
          },
        });

        if (response.ok) {
          const json = await response.json();
          const result = ModelListSchema.safeParse(json);
          if (result.success) {
            this.onlineModelList = result.data.data.map(model => model.id);
          }
        }
      }
    } catch (e) {
      this.logger.error('Failed to fetch available models from custom provider', e);
    }
  }

  override async text(
    cond: ModelConditions,
    messages: PromptMessage[],
    options: CopilotChatOptions = {}
  ): Promise<string> {
    const fullCond = { ...cond, outputType: ModelOutputType.Text };
    await this.checkParams({ messages, cond: fullCond, options });
    const model = this.selectModel(fullCond);

    const [system, msgs] = await chatToGPTMessage(messages);
    const modelInstance = this.#instance(model.id);

    try {
      metrics.ai.counter('generate_text_calls').add(1, { model: model.id });

      const result = await generateText({
        model: modelInstance,
        system,
        messages: msgs,
        frequencyPenalty: options.frequencyPenalty ?? 0,
        presencePenalty: options.presencePenalty ?? 0,
        temperature: options.temperature ?? 0,
        maxOutputTokens: options.maxTokens ?? 4096,
        abortSignal: options.signal,
      });

      return result.text;
    } catch (e: any) {
      metrics.ai.counter('generate_text_errors').add(1, { model: model.id });
      throw this.handleError(e, model.id, options);
    }
  }

  override async *streamText(
    cond: ModelConditions,
    messages: PromptMessage[],
    options: CopilotChatOptions = {}
  ): AsyncIterable<string> {
    const fullCond = { ...cond, outputType: ModelOutputType.Text };
    await this.checkParams({ messages, cond: fullCond, options });
    const model = this.selectModel(fullCond);

    try {
      metrics.ai.counter('generate_text_stream_calls').add(1, { model: model.id });

      const fullStream = await this.getFullStream(model, messages, options);
      const parser = new TextStreamParser();
      for await (const item of fullStream) {
        const text = parser.parse(item);
        if (text) {
          yield text;
        }
      }
    } catch (e: any) {
      metrics.ai.counter('generate_text_stream_errors').add(1, { model: model.id });
      throw this.handleError(e, model.id, options);
    }
  }

  override async *streamObject(
    cond: ModelConditions,
    messages: PromptMessage[],
    options: CopilotChatOptions = {}
  ): AsyncIterable<StreamObject> {
    const fullCond = { ...cond, outputType: ModelOutputType.Object };
    await this.checkParams({ messages, cond: fullCond, options });
    const model = this.selectModel(fullCond);

    try {
      metrics.ai.counter('generate_object_stream_calls').add(1, { model: model.id });

      const fullStream = await this.getFullStream(model, messages, options);
      const parser = new StreamObjectParser();
      for await (const item of fullStream) {
        const object = parser.parse(item);
        if (object) {
          yield object;
        }
      }
    } catch (e: any) {
      metrics.ai.counter('generate_object_stream_errors').add(1, { model: model.id });
      throw this.handleError(e, model.id, options);
    }
  }

  override async structure(
    cond: ModelConditions,
    messages: PromptMessage[],
    options: CopilotStructuredOptions = {}
  ): Promise<string> {
    const fullCond = { ...cond, outputType: ModelOutputType.Structured };
    await this.checkParams({ messages, cond: fullCond, options });
    const model = this.selectModel(fullCond);

    const [system, msgs] = await chatToGPTMessage(messages);
    const modelInstance = this.#instance(model.id);

    try {
      metrics.ai.counter('generate_structure_calls').add(1, { model: model.id });

      const result = await generateObject({
        model: modelInstance,
        mode: 'json',
        output: 'no-schema',
        system,
        messages: msgs,
        temperature: options?.temperature ?? 0,
        maxOutputTokens: options?.maxTokens ?? 4096,
        maxRetries: options?.maxRetries ?? 1,
        abortSignal: options?.signal,
      });

      return JSON.stringify(result.object);
    } catch (e: any) {
      metrics.ai.counter('generate_structure_errors').add(1, { model: model.id });
      throw this.handleError(e, model.id, options);
    }
  }

  private async getFullStream(
    model: CopilotProviderModel,
    messages: PromptMessage[],
    options: CopilotChatOptions = {}
  ) {
    const [system, msgs] = await chatToGPTMessage(messages);
    const modelInstance = this.#instance(model.id);
    const { fullStream } = streamText({
      model: modelInstance,
      system,
      messages: msgs,
      frequencyPenalty: options.frequencyPenalty ?? 0,
      presencePenalty: options.presencePenalty ?? 0,
      temperature: options.temperature ?? 0,
      maxOutputTokens: options.maxTokens ?? 4096,
      tools: await this.getTools(options, model.id),
      stopWhen: stepCountIs(this.MAX_STEPS),
      abortSignal: options.signal,
    });
    return fullStream;
  }

  override async embedding(
    cond: ModelConditions,
    messages: string | string[],
    options: CopilotEmbeddingOptions = { dimensions: DEFAULT_DIMENSIONS }
  ): Promise<number[][]> {
    messages = Array.isArray(messages) ? messages : [messages];
    const fullCond = { ...cond, outputType: ModelOutputType.Embedding };
    await this.checkParams({ embeddings: messages, cond: fullCond, options });
    const model = this.selectModel(fullCond);

    try {
      metrics.ai.counter('generate_embedding_calls').add(1, { model: model.id });

      const modelInstance = this.#instance.embedding(model.id);

      const { embeddings } = await embedMany({
        model: modelInstance,
        values: messages,
        providerOptions: {
          'openai-compatible': {
            dimensions: options.dimensions || DEFAULT_DIMENSIONS,
          },
        },
      });

      return embeddings.filter(v => v && Array.isArray(v));
    } catch (e: any) {
      metrics.ai.counter('generate_embedding_errors').add(1, { model: model.id });
      throw this.handleError(e, model.id, options);
    }
  }
}
