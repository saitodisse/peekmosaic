import type { ServiceRegistry } from './registry';
import { previousPublishedResourceBases } from '../local-manifest-suggestions';

export interface ResourceClient {
  request(input: { url: string }): Promise<{ status: number; contentType: string; body: string } | undefined>;
}

interface ResourceLocation {
  manifestUrl: string;
  entrypoint: string;
}

/** Keep URL-based access working for host requests and services used by other add-ons. */
export function withPublishedResourceAliases(provider: ResourceClient, location: ResourceLocation): ResourceClient {
  const previousBases = previousPublishedResourceBases(location.manifestUrl);
  if (!previousBases.length) return provider;
  const entrypointBase = new URL('.', new URL(location.entrypoint, location.manifestUrl)).href;
  return {
    async request(input) {
      const response = await provider.request(input);
      if (response) return response;
      const base = previousBases.find((candidate) => input.url.startsWith(candidate));
      if (!base) return undefined;
      const upgraded = await provider.request({ url: entrypointBase + input.url.slice(base.length) });
      return upgraded?.status === 404 ? undefined : upgraded;
    },
  };
}

/** Local providers own resource URLs; an unclaimed URL uses the HTTP adapter. */
export function createResourceFetch(registry: ServiceRegistry, network: typeof fetch = fetch, locations: () => ResourceLocation[] = () => []): typeof fetch {
  return async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if ((init?.method ?? (input instanceof Request ? input.method : 'GET')) === 'GET') {
      const candidates = [url];
      for (const location of locations()) {
        const manifestBase = new URL('.', location.manifestUrl).href;
        const entrypointBase = new URL('.', new URL(location.entrypoint, location.manifestUrl)).href;
        if (url.startsWith(manifestBase) && manifestBase !== entrypointBase) {
          candidates.push(entrypointBase + url.slice(manifestBase.length));
        }
      }
      for (const provider of registry.getAll<ResourceClient>('host.resource-client')) {
        for (const candidate of candidates) {
          const response = await provider.request({ url: candidate });
          if (response) return new Response(response.body, { status: response.status, headers: { 'Content-Type': response.contentType } });
        }
      }
    }
    return network(input, init);
  };
}
