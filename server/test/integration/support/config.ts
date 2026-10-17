import type { ConfigService } from '@nestjs/config';

/** Spies ConfigService.get: listed keys answer the given value (undefined = missing, so the default), the rest the real config */
export function createConfigOverride(config: ConfigService) {
  let spy: { mockRestore: () => void } | undefined;
  return {
    override(values: Record<string, string | undefined>) {
      this.restore();
      const original = config.get.bind(config) as (key: string, fallback?: unknown) => unknown;
      spy = vi.spyOn(config, 'get').mockImplementation(((key: string, fallback?: unknown) =>
        key in values ? (values[key] ?? fallback) : original(key, fallback)) as never);
    },
    restore() {
      spy?.mockRestore();
      spy = undefined;
    },
  };
}
