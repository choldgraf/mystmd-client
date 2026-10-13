import { mystParse } from 'myst-parser';
import {
  abbreviationPlugin,
  basicTransformationsPlugin,
  enumerateTargetsPlugin,
  footnotesPlugin,
  getFrontmatter,
  glossaryPlugin,
  headingDepthPlugin,
  htmlPlugin,
  joinGatesPlugin,
  keysPlugin,
  mathPlugin,
  reconstructHtmlPlugin,
  ReferenceState,
  resolveReferencesPlugin,
} from 'myst-transforms';
import { defaultDirectives } from 'myst-directives';
import { defaultRoles } from 'myst-roles';
import { buttonRole } from 'myst-ext-button';
import { cardDirective } from 'myst-ext-card';
import { exerciseDirectives } from 'myst-ext-exercise';
import { gridDirectives } from 'myst-ext-grid';
import { proofDirective } from 'myst-ext-proof';
import { tabDirectives } from 'myst-ext-tabs';
import type { GenericNode, GenericParent } from 'myst-common';
import { unified } from 'unified';
import { visit } from 'unist-util-visit';
import { VFile } from 'vfile';

// A parse exported by mystmd would replace this (myst-author upstream proposal U8).
// The extensions mystmd enables by default, so the parse matches `myst build`.
const extDirectives = [cardDirective, ...gridDirectives, ...tabDirectives, proofDirective, ...exerciseDirectives];
const extRoles = [buttonRole];
/** Every directive and role the parser knows: myst-parser's defaults plus the extensions. */
export const directives = [...defaultDirectives, ...extDirectives];
export const roles = [...defaultRoles, ...extRoles];

/** Parse MyST without transforms; myst-parser adds its default directives and roles to the extensions. */
export const parse = (s: string, vfile?: VFile) => mystParse(s, { markdownit: { linkify: true }, directives: extDirectives, roles: extRoles, vfile });

/** Parse and transform a single MyST page, without the rest of the project. */
export function parseMyst(md: string) {
  const vfile = new VFile();
  const tree = parse(md, vfile) as GenericParent;

  // Directive transforms replace the directive node with children that have no position; keep the directive's lines.
  visit(tree, 'mystDirective', (d: GenericNode) => d.children?.forEach((c) => (c.position ??= d.position)));

  // Like mystmd, read the YAML frontmatter and use the first heading as the title if there isn't one.
  // Unlike mystmd, keep a leading `# Title` for the outline and labels.
  // Half-typed YAML adds a `frontmatter-is-yaml` message, which service.ts doesn't show.
  const { frontmatter } = getFrontmatter(vfile, tree, { propagateTargets: true, keepTitleNode: true }) as { frontmatter: Record<string, any> };

  // Without the project's bibliography, no citation is found, so mystmd's fallback turns `@label` into a reference to a label on this page, as a build does.
  visit(tree, 'cite', (c: GenericNode) => void (c.error = true));

  const state = new ReferenceState('', { frontmatter, vfile });
  unified()
    .use(reconstructHtmlPlugin)
    .use(htmlPlugin)
    .use(basicTransformationsPlugin, { parser: (s: string) => parse(s, vfile) })
    // Like mystmd: content headings start at h2, under the page title, unless the title was taken from the content's first heading.
    .use(headingDepthPlugin, { firstDepth: frontmatter.content_includes_title ? 1 : 2 })
    .use(mathPlugin, { macros: {} })
    .use(glossaryPlugin)
    .use(abbreviationPlugin, { abbreviations: {} })
    .use(enumerateTargetsPlugin, { state })
    .use(footnotesPlugin)
    .use(joinGatesPlugin)
    .use(resolveReferencesPlugin, { state })
    .use(keysPlugin)
    .runSync(tree as any, vfile);

  return { tree, messages: vfile.messages };
}
