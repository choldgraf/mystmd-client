import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { GenericParent } from 'myst-common';
import { parseMyst } from './parse.ts';

// The root's children are blocks; these are the nodes in them.
const nodes = (tree: GenericParent) => tree.children.flatMap((block) => block.children!);

test('removes a leading title unless keepTitle, and gives directive children a position', () => {
  const md = '# Title\n\n:::{note}\nHi\n:::\n';
  const { tree, frontmatter } = parseMyst(md);
  assert.equal(frontmatter.title, 'Title');
  assert.deepEqual(nodes(tree).map((n) => [n.type, n.position?.start.line]), [['admonition', 3]]);
  assert.deepEqual(nodes(parseMyst(md, { keepTitle: true }).tree).map((n) => n.type), ['heading', 'admonition']);
});
