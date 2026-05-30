import type { StepHandler } from '@flowforge/shared';
import { httpRequestSchema } from '../schemas/http-request.schema.js';

export const httpRequestHandler: StepHandler = async (ctx, input) => {
  if (ctx.signal.aborted) {
    throw ctx.signal.reason || new Error('Cancellation requested before executing HTTP request');
  }

  // Parse input
  const parsed = httpRequestSchema.parse(input);

  ctx.logger.info({ url: parsed.url, method: parsed.method }, `Executing HTTP request to ${parsed.url}`);

  // Set up cancellation and timeout signals
  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => {
    timeoutController.abort(new Error(`HTTP request timed out after ${parsed.timeoutMs}ms`));
  }, parsed.timeoutMs);

  const signal = AbortSignal.any([ctx.signal, timeoutController.signal]);

  try {
    const requestHeaders: Record<string, string> = { ...parsed.headers };
    let requestBody: any = undefined;

    if (parsed.body !== undefined) {
      if (typeof parsed.body === 'string') {
        requestBody = parsed.body;
      } else {
        requestBody = JSON.stringify(parsed.body);
        if (!Object.keys(requestHeaders).some(h => h.toLowerCase() === 'content-type')) {
          requestHeaders['content-type'] = 'application/json';
        }
      }
    }

    const res = await fetch(parsed.url, {
      method: parsed.method,
      headers: requestHeaders,
      body: requestBody,
      signal,
    });

    clearTimeout(timeoutId);

    // If step was cancelled while fetching or right after fetching
    if (ctx.signal.aborted) {
      throw ctx.signal.reason || new Error('HTTP request execution was cancelled');
    }

    const responseHeaders = Object.fromEntries(res.headers.entries());
    let responseBody: any;
    const contentType = res.headers.get('content-type') || '';
    const text = await res.text();

    if (contentType.includes('application/json')) {
      try {
        responseBody = JSON.parse(text);
      } catch {
        responseBody = text;
      }
    } else {
      responseBody = text;
    }

    if (parsed.throwOnError && !res.ok) {
      throw new Error(`HTTP request failed with status ${res.status}: ${text.slice(0, 500)}`);
    }

    return {
      status: res.status,
      headers: responseHeaders,
      body: responseBody,
    };
  } catch (error: any) {
    clearTimeout(timeoutId);

    // If abort was triggered by the parent abort signal
    if (ctx.signal.aborted) {
      throw ctx.signal.reason || new Error('HTTP request was cancelled');
    }

    // If the error was a timeout error
    if (timeoutController.signal.aborted) {
      throw timeoutController.signal.reason || new Error(`HTTP request timed out after ${parsed.timeoutMs}ms`);
    }

    throw error;
  }
};
