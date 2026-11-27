import { describe, expect, it, vi } from 'vitest';
import { createResourceFetch, withPublishedResourceAliases } from './resource-client';
import { ServiceRegistry } from './registry';

describe('device resource adapter', () => {
  it('keeps links from older published releases readable after an upgrade', async () => {
    const registry = new ServiceRegistry();
    const release = 'https://addons-poc-release-1-20-0.vercel.app/chord-catalog';
    const provider = withPublishedResourceAliases({
      request: async ({ url }: { url: string }) => url.startsWith(release)
        ? { status: url.endsWith('/song/content.txt') ? 200 : 404, contentType: 'text/plain', body: 'local' }
        : undefined,
    }, {
      manifestUrl: 'https://www.peekmosaic.com/addons/1.20.0/chord-catalog/manifest.json',
      entrypoint: release + '/bundle.js',
    });
    registry.register('host.resource-client', provider, 'provider');
    const network = vi.fn(async () => new Response('published'));
    const fetchResource = createResourceFetch(registry, network);
    for (const url of [
      'https://www.peekmosaic.com/addons/1.19.0/chord-catalog/text/chart/song/content.txt',
      'https://addons-poc-release-1-19-0.vercel.app/chord-catalog/text/chart/song/content.txt',
    ]) expect(await (await fetchResource(url)).text()).toBe('local');
    expect(network).not.toHaveBeenCalled();
    const missing = 'https://addons-poc-release-1-19-0.vercel.app/chord-catalog/text/chart/other/content.txt';
    expect(await (await fetchResource(missing)).text()).toBe('published');
    expect(network).toHaveBeenCalledWith(missing, undefined);
  });
  it('routes a branded manifest URL to the installed local provider at its bundle origin', async () => {
    const registry = new ServiceRegistry();
    registry.register('host.resource-client', { request: async ({ url }: { url: string }) => url === 'https://release.example/chord-catalog/search/chart/Bob.json?limit=10' ? { status: 200, contentType: 'application/json', body: '{"local":true}' } : undefined }, 'provider');
    const network = vi.fn(async () => new Response('network'));
    const fetchResource = createResourceFetch(registry, network, () => [{
      manifestUrl: 'https://www.example/addons/1.17.2/chord-catalog/manifest.json',
      entrypoint: 'https://release.example/chord-catalog/bundle.js',
    }]);
    const response = await fetchResource('https://www.example/addons/1.17.2/chord-catalog/search/chart/Bob.json?limit=10');
    expect(await response.json()).toEqual({ local: true });
    expect(network).not.toHaveBeenCalled();
  });
  it('reads a provider response without reaching the network', async () => {
    const registry = new ServiceRegistry();
    registry.register('host.resource-client', { request: async () => ({ status: 200, contentType: 'application/json', body: '{"local":true}' }) }, 'provider');
    const network = vi.fn();
    const response = await createResourceFetch(registry, network)('https://example.test/search/chart/song.json');
    expect(await response.json()).toEqual({ local: true });
    expect(network).not.toHaveBeenCalled();
  });
  it('asks providers by priority and falls back for unclaimed URLs', async () => {
    const registry = new ServiceRegistry();
    const order: string[] = [];
    registry.register('host.resource-client', { request: async () => { order.push('low'); return undefined; } }, 'low', 1);
    registry.register('host.resource-client', { request: async () => { order.push('high'); return undefined; } }, 'high', 2);
    const network = vi.fn(async () => new Response('network'));
    expect(await (await createResourceFetch(registry, network)('https://example.test/')).text()).toBe('network');
    expect(order).toEqual(['high', 'low']);
  });
});
