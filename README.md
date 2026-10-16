# mystmd-client

This package starts mystmd (`myst start --headless`), reads the content server it exposes, and parses MyST with mystmd's own settings.
It replaces two copies of the same code that were kept in sync by hand, one in [mystmd-lsp](https://github.com/choldgraf/mystmd-lsp) and one in [myst-author](https://github.com/choldgraf/myst-author).
It is installed from GitHub rather than npm because it goes away once mystmd [exports these helpers](#what-it-needs-upstream).

## Use

```
npm install mystmd-client@github:choldgraf/mystmd-client
```

npm builds it on install with the `prepare` script.
To move a consumer to a newer commit, run the same command (or `npm update mystmd-client`) and commit the lock file.

```ts
import { parse, parseMyst, directives, roles } from 'mystmd-client/parse';
import { startMyst } from 'mystmd-client/start';
import { contentServer, mystmdMissing, type BuiltPage, type TocEntry } from 'mystmd-client/content-server';

const { tree, frontmatter, messages } = parseMyst(text, { keepTitle: true });

const myst = await startMyst(root, log, ['--execute']); // root holds myst.yml. log and args are optional.
// myst: { url, ready, exited, stop }

const server = contentServer(myst.url);
const pages: BuiltPage[] = await server.pages();
const toc: TocEntry[] = await server.toc();
const stopWatching = server.watch(onReload);
```

`parse` is mystmd's parser with its default directives and roles, and no transforms.
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
Run the `myst` CLI yourself when you need a full export or site build.

## Develop

`npm test` runs without mystmd.
`npm run test:mystmd` also starts the real `mystmd` devDependency and checks its content server.
CI runs both, plus `npm run typecheck`.
`npm run docs:live` previews the [docs site](https://chrisholdgraf.com/mystmd-client/), which is this README, and `npm run docs` builds it.

`myst-parser` is pinned to an exact version in `package.json`.
When you bump `mystmd`, check that it still uses that `myst-parser` version, so `parseMyst` keeps matching `myst build`.
The published `mystmd` package doesn't list that version, so find it in `packages/myst-cli/package.json` at the matching [mystmd tag](https://github.com/jupyter-book/mystmd/tags).
Consumers pin a commit of this package in their lock file, and their `myst-common` range should match ours so the tree types line up.

## Interface

### `parse`

- `parseMyst` runs mystmd's single-page transforms with the extensions mystmd enables by default.
- `directives` and `roles` list what `parseMyst` parses.
- `keepTitle: true` keeps a leading `# Title`, which mystmd removes.
- `frontmatter` is what mystmd's frontmatter transform returns, including `title` and `content_includes_title`.
- `messages` are the parse and transform messages.
- A directive's children carry the directive's position, because directive transforms drop it.

### `start`

- `startMyst` picks the port and serves at `http://127.0.0.1:<port>`, because `myst start` otherwise [binds only IPv6 `localhost`](https://github.com/jupyter-book/mystmd/issues/2254).
- Nothing handles a conflict if another process takes that port before mystmd binds it.
- `log` receives each line of mystmd's stdout and stderr, prefixed with `[myst] `, and defaults to `console.log`.
- `ready` resolves when mystmd logs "Content server started".
  It rejects if mystmd exits before then, and with `mystmdMissing` if mystmd isn't installed.
- `exited` rejects if mystmd dies or isn't installed, including after `stop`.
  Nothing restarts mystmd.

### `content-server`

- `BuiltPage` is the page JSON that the content server serves at `/content/<slug>.json`.
  Consumers read its `location`, `mdast`, `sha256`, `frontmatter` and `references`.
- `pages()` reads each page's JSON from the content server, the index page first.
- `pages()` reads only the first project in `config.json`.
- `toc()` is the first project's table of contents, the index page first: `{ title, level, file? }` per entry, where a part has no `file`.
- `watch` calls back on every rebuild and on (re)connect.
  It returns a function that stops it.
- A failed content server request throws an error whose message is the response body.

The other exports (`built`, `fileForSlug`, `rebaseFetched`, `sha256`, `savedHashes` and the types `Built` and `ContentServer`) are for myst-author alone.

## What it needs upstream

This package can be deleted once mystmd exports what its three entry points provide: a single-page parse, a `myst start --headless` launcher and a content-server client.
myst-author's [upstream list](https://github.com/choldgraf/myst-author/blob/main/upstream/README.md) asks for those exports.
