import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { contentServer } from './content-server.ts';

const files: Record<string, object> = {
  '/prefix/config.json': { projects: [{ index: 'home', pages: [{ title: 'Part' }, { slug: 'guide-a' }] }] },
  '/prefix/content/home.json': { location: '/index.md', mdast: { type: 'root', children: [] } },
  '/prefix/content/guide-a.json': { location: '/guide/a.md', mdast: { type: 'root', children: [{ type: 'image', url: '/x.png' }, { type: 'output', jupyter_data: { data: { 'image/png': { path: '/y.png' } } } }] } },
};

test('reads built pages under a path prefix and maps slugs to files', async (t) => {
  const server: Server = createServer((req, res) => {
    const body = files[req.url!];
    res.writeHead(body ? 200 : 404).end(body ? JSON.stringify(body) : 'not found');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${(server.address() as any).port}/prefix/`;

  const myst = contentServer(base, 'http://assets');
  const [image, output] = (await myst.built('guide/a.md')).page!.mdast.children;
  assert.equal(image.url, 'http://assets/x.png');
  assert.equal(output.jupyter_data.data['image/png'].path, 'http://assets/y.png');
  assert.equal(myst.fileForSlug('guide-a'), 'guide/a.md');
  assert.equal(myst.fileForSlug(''), 'index.md');
  assert.equal(myst.fileForSlug('nope'), undefined);
  assert.deepEqual((await myst.pages()).map((p) => p.location), ['/index.md', '/guide/a.md']);
  assert.deepEqual(await myst.built('missing.md'), { path: 'missing.md', page: null });
  assert.deepEqual(await contentServer(base + 'nope').built('a.md'), { path: 'a.md', page: null, error: 'not found' });
});
