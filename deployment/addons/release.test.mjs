import { test } from 'node:test';
import assert from 'node:assert/strict';
import { releaseInfo } from './release-utils.mjs';
import handler from './api/catalog.mjs';

test('release names only accept stable semantic versions', () => {
  assert.equal(releaseInfo('1.16.0').origin, 'https://addons-poc-release-1-16-0.vercel.app');
  for (const version of ['1.2.3-rc.1', '../1.2.3', '01.2.3', '1.2']) assert.throws(() => releaseInfo(version));
});

test('deployed catalogue starts empty and rejects old bundled charts', async () => {
  const request = async (path) => {
    let status = 200;
    let body;
    const response = {
      setHeader() {},
      status(code) { status = code; return this; },
      json(value) { body = value; },
    };
    await handler({ method: 'GET', url: `/chord-catalog/${path}`, headers: { host: 'example.test' } }, response);
    return { status, body };
  };
  for (const path of ['catalog/chart/recent.json', 'search/chart/vela%20nova.json']) {
    const { status, body } = await request(path);
    assert.equal(status, 200);
    assert.deepEqual(body.metas, []);
    assert.equal(body.pagination.total, 0);
  }
  const { status, body } = await request('text/chart/static-and-rain/content.txt');
  assert.equal(status, 404);
  assert.equal(body.error, 'CHART_NOT_FOUND');
});
