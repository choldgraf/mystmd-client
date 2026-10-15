# mystmd-client

This package starts mystmd (`myst start --headless`), reads its content server, and parses MyST with mystmd's own settings.
It replaces two copies of the same code that were kept in sync by hand, one in [mystmd-lsp](https://github.com/choldgraf/mystmd-lsp) and one in [myst-author](https://github.com/choldgraf/myst-author).
It is installed from GitHub rather than npm because it goes away once mystmd exports these helpers (see [What it needs upstream](#what-it-needs-upstream)).

## Use

```
npm install mystmd-client@github:choldgraf/mystmd-client
```

npm builds it on install with the `prepare` script.
To move a consumer to a newer commit, run the same command (or `npm update mystmd-client`) and commit the lock file.

```ts
import { parse, parseMyst, directives, roles } from 'mystmd-client/parse';
import { startMyst } from 'mystmd-client/start';
import { contentServer, mystmdMissing, type BuiltPage } from 'mystmd-client/content-server';

const { tree, frontmatter, messages } = parseMyst(text, { keepTitle: true });

const myst = await startMyst(root, log, ['--execute']); // root holds myst.yml. log and args are optional.
// myst: { url, ready, exited, stop }

const server = contentServer(myst.url);
const pages: BuiltPage[] = await server.pages();
const stopWatching = server.watch(onReload);
```

`parse` is the bare `mystParse` call with `linkify` and mystmd's extension directives and roles.
`parseMyst` also runs the transforms for a single page.

## How it works

```mermaid
flowchart LR
  consumer["consumer (mystmd-lsp, myst-author)"]
  consumer -->|start| child["myst start --headless (child process)"]
  consumer -->|content-server| client["content-server client"]
  client -->|"HTTP and websocket"| child
  child -->|"built page JSON"| client
  consumer -->|parse| parser["myst-parser, in-process, no child"]
```

Use `parse` to parse one page with mystmd's settings and extensions when you can't wait for a build.
Use `start` and `content-server` when you need the page as mystmd built it, plugins and cross-references included.
Call `myst` yourself when you need a full export or site build.

## Develop

`npm test` runs without mystmd.
`npm run test:mystmd` also starts the real `mystmd` devDependency and checks its content server.
CI runs both, plus `npm run typecheck`.
`npm run docs:live` previews the [docs site](https://chrisholdgraf.com/mystmd-client/), which is this README, and `npm run docs` builds it.

## Interface

Paths are in the [mystmd repository](https://github.com/jupyter-book/mystmd), and U-numbers are in [myst-author's upstream list](https://github.com/choldgraf/myst-author/blob/main/upstream/README.md).

### `parse`

- `parseMyst` runs mystmd's single-page transforms with the extensions mystmd enables by default (`packages/myst-cli/src/process/myst.ts` and `mdast.ts`).
- `directives` and `roles` list what `parseMyst` parses.
- `keepTitle: true` keeps a leading `# Title`, which mystmd removes (`keepTitleNode` in `packages/myst-cli/src/frontmatter.ts`).
- `frontmatter.title` and `frontmatter.content_includes_title` come from `getFrontmatter` in `packages/myst-transforms/src/frontmatter.ts`.
  myst-author's preview reads `content_includes_title` to decide whether to show a title.
- `messages` are the parse and transform messages.
- A directive's children carry the directive's position, because directive transforms drop it (see [Data and packaging gaps](https://github.com/choldgraf/myst-author/blob/main/upstream/README.md#data-and-packaging-gaps-candidates-for-small-fixes) in myst-author's upstream list).

### `start`

- `startMyst` picks the port and serves at `http://127.0.0.1:<port>`, because `myst start` otherwise binds only IPv6 `localhost` (`packages/myst-cli/src/build/site/start.ts`, [mystmd#2254](https://github.com/jupyter-book/mystmd/issues/2254), [mystmd#2471](https://github.com/jupyter-book/mystmd/issues/2471)).
- Nothing handles a conflict if another process takes that port before mystmd binds it.
- `log` receives each line of mystmd's stdout and stderr, prefixed with `[myst] `, and defaults to `console.log`.
- `ready` resolves when mystmd logs "Content server started".
  It rejects if mystmd exits before then, and with `mystmdMissing` if mystmd isn't installed.
- `exited` rejects if mystmd dies or isn't installed, including after `stop`.
  Nothing restarts mystmd.

### `content-server`

- `BuiltPage` is the page JSON that `myst start`'s content server serves at `/content/<slug>.json`.
  Consumers read its `location`, `mdast`, `sha256`, `frontmatter` and `references`.
- `pages()` reads each page's JSON from the content server, the index page first, because `myst.xref.json` isn't rewritten on edits and lacks `title` and `enumerator` ([U1](https://github.com/choldgraf/myst-author/blob/main/upstream/U1-richer-xref-entries.md)).
- `pages()` reads only the first project in `config.json`, so a multi-project site returns that project's pages.
- `watch` calls back on every rebuild and on (re)connect (`/socket` in `packages/myst-cli/src/build/site/start.ts`).
  It returns a function that stops it.
- A failed content server request throws an error whose message is the response body.
  So a host that proxies the content server and answers 503 with `mystmdMissing` surfaces that text as the error, which myst-author's app server and preview read.

These exports are for myst-author alone:

- `built`, `fileForSlug`, `rebaseFetched`, `sha256` and `savedHashes`
- the types `Built` and `ContentServer`

They encode mystmd's file hash and URL roots.
mystmd-lsp doesn't call them.

## What it found

Replacing the two copies with this package:

| Repository | Change | Diff | Command |
| --- | --- | --- | --- |
| mystmd-lsp | deleted the copies in `src/mystmd/` | +32/−225 (without `package-lock.json`) | `git -C mystmd-lsp diff --shortstat 15a63dd..b6c390f -- . ':!package-lock.json'` |
| myst-author | deleted `packages/mystmd` | +51/−381 | `git -C myst-author diff --shortstat e567422..d17e991` |

The two copies had drifted apart before the merge.
The commits in this repo that reconciled them (`git log --oneline 97acb47^..56f39fd`) say how each difference was resolved.

## Where it could go next

A conformance check that compares `parseMyst` against what `myst build` produces.

## What it needs upstream

This package can be deleted once mystmd exports what its three entry points provide: a single-page parse (`parse`), a `myst start --headless` launcher (`start`) and a content-server client (`content-server`).
That is proposal [U8](https://github.com/choldgraf/myst-author/blob/main/upstream/README.md) in myst-author's upstream list.

## What must stay in sync by hand

The package reaches into mystmd's internals: the parse pipeline, the transform plugins and the content server's JSON shape.

- `myst-parser` is pinned to an exact version in `package.json`, so the tokenizer and the conversion from tokens to mdast only change when we bump it.
  The directive and role definitions (`myst-directives`, `myst-roles`, `myst-ext-*`) and `myst-transforms` are caret ranges, so an install can still pick up newer ones.
- When bumping `mystmd`, check it still uses the `myst-parser` version pinned in `package.json`, so `parseMyst` keeps matching `myst build`.
  mystmd bundles its CLI with no dependency list, so read `packages/myst-cli/package.json` at the `mystmd@<version>` [tag](https://github.com/jupyter-book/mystmd/tags).
- The parse options, extension list and transform order, copied from the mystmd files named under [Interface](#interface).
- The position copy, `HOST=127.0.0.1`, the "Content server started" line and reading per-page JSON, each described under [Interface](#interface).
- The content server's routes (`/config.json`, `/content/<slug>.json`, `/socket`) and the `BuiltPage` fields we read.
- The `config.json` shape (`projects[0].index` and `pages[].slug`) that `pages()` and `built()` read.
- The `RELOAD` socket message that `watch` reads.
- The node fields `rebaseUrls` rewrites (`image.url` and `urlOptimized`, `crossReference.dataUrl`, `output.jupyter_data.data[*].path`) and the `/content/` prefix it adds, which must match mystmd's page JSON.
- `savedHashes`, which must match how mystmd hashes a file for a page's `sha256`.
- The `MYST_BIN` env var, which both consumers' docs describe, and the `--headless` and `--server-port` flags that `startMyst` passes.
- The commit of this package that each consumer's lock file pins (see [Use](#use) to move it).
- The `myst-common` range in each consumer, which should match ours so the `GenericParent` type lines up.
