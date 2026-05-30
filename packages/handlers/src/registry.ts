import type { StepHandler } from '@flowforge/shared';

export class HandlerRegistry {
  private readonly handlers: Map<string, StepHandler> = new Map();

  register(name: string, handler: StepHandler): void {
    if (this.handlers.has(name)) {
      throw new Error(`Handler "${name}" is already registered`);
    }
    this.handlers.set(name, handler);
  }

  get(name: string): StepHandler {
    const handler = this.handlers.get(name);
    if (!handler) throw new Error(`Handler "${name}" is not registered`);
    return handler;
  }

  has(name: string): boolean {
    return this.handlers.has(name);
  }

  getAll(): string[] {
    return Array.from(this.handlers.keys());
  }
}

export const handlerRegistry = new HandlerRegistry();
