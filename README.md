# mystmd-client

This package starts mystmd, the MyST build tool, with `myst start --headless`.
Then it reads the built pages from the content server that command runs.
It also parses MyST with mystmd's own settings.
It holds code that [mystmd-lsp](https://github.com/choldgraf/mystmd-lsp) and [myst-author](https://github.com/choldgraf/myst-author) both need, so they don't each keep a copy in sync by hand.
It is installed from GitHub rather than npm because it's only needed until mystmd [exports these helpers](#what-it-needs-upstream).

## Use

```
npm install mystmd-client@github:choldgraf/mystmd-client
```

npm builds it on install with the `prepare` script.
To move a project that uses it to a newer commit, run the same command or `npm update mystmd-client`, then commit that project's lock file.

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

## How it works

```mermaid
flowchart LR
  consumer["consumer (mystmd-lsp, myst-author)"]
  consumer -->|start| child["myst start --headless (child process)"]
  consumer -->|content-server| client["content-server client"]
  client -->|"HTTP and websocket"| child
  child -->|"built page JSON"| client
  consumer -->|parse| parser["myst-parser (no child process)"]
```

Use `mystmd-client/parse` to parse one page with mystmd's settings and extensions when you can't wait for a build.
Use `mystmd-client/start` and `mystmd-client/content-server` when you need mystmd's full build of a page, including plugins and cross-references.
Run the `myst` CLI yourself when you need a full export or site build.

## Develop

`npm test` runs without mystmd.
`npm run test:mystmd` also starts the real `mystmd` devDependency and checks its content server.
CI runs `npm run test:mystmd` and `npm run typecheck`.
The [docs site](https://chrisholdgraf.com/mystmd-client/) is this README.
`npm run docs:live` previews it and `npm run docs` builds it.

mystmd-lsp and myst-author pin a commit of this package in their lock files.
Their `myst-common` range should match ours, so all three packages use the same tree types.

## Interface

### `parse`

- `parse` runs myst-parser with mystmd's extensions and no transforms.
- `parseMyst` runs mystmd's single-page transforms with the extensions mystmd enables by default.
- `directives` and `roles` list what `parseMyst` parses.
- `keepTitle: true` keeps a leading `# Title`, which mystmd removes.
- `frontmatter` is what mystmd's frontmatter transform returns, including `title` and `content_includes_title`.
- `messages` are the parse and transform messages.
- Directive transforms leave a directive's children without a position, so `parseMyst` gives them the directive's position.

### `start`

- `startMyst` runs `myst` from `PATH`, or the binary named in `MYST_BIN`.
- It picks a free port and sets `HOST=127.0.0.1`, so mystmd serves at `http://127.0.0.1:<port>`.
  Without `HOST`, `myst start` [binds only IPv6 `localhost`](https://github.com/jupyter-book/mystmd/issues/2254).
- Nothing handles a conflict if another process takes that port before mystmd binds it.
- `log` receives each line of mystmd's stdout and stderr, prefixed with `[myst] `.
  It defaults to `console.log`.
- `ready` resolves when mystmd logs "Content server started".
  It rejects if mystmd exits before then.
  If mystmd isn't installed, it rejects with an error whose message is `mystmdMissing`.
- `exited` rejects if mystmd dies or isn't installed.
  Calling `stop` makes it reject too.
  Nothing restarts mystmd.

### `content-server`

- `BuiltPage` is the page JSON that the content server serves at `/content/<slug>.json`.
  The type has only the fields mystmd-lsp and myst-author read: `location`, `mdast`, `sha256`, `frontmatter` and `references`.
- `pages()` reads each page's JSON from the content server, the index page first.
- `pages()` reads only the first project in `config.json`.
- `toc()` is the first project's table of contents, the index page first.
  Each entry is `{ title, level, file? }`.
  Parts and external links have no `file`.
- `watch` calls back on every rebuild, and whenever its websocket connects or reconnects.
  It returns a function that stops watching.
- A failed content server request throws an error whose message is the response body.

The rest is for myst-author alone:

- The `assets` argument of `contentServer()`, and the `built` and `fileForSlug` methods on the client it returns.
- The exports `rebaseFetched`, `sha256` and `savedHashes`.
- The types `Built` and `ContentServer`.

## What it needs upstream

This package can be deleted once mystmd exports its own single-page parse, `myst start --headless` launcher and content-server client.
myst-author's [upstream list](https://github.com/choldgraf/myst-author/blob/main/upstream/README.md) asks for those exports.
