# mystmd-client

This package starts mystmd (`myst start`), reads its content server, and parses MyST with mystmd's own settings.
It replaces two copies of the same code that were kept in sync by hand, one in `mystmd-lsp` and one in `myst-author`.
It is installed from GitHub, not npm.
It goes away when mystmd exports these helpers itself (proposal U8 in [myst-author's upstream list](https://github.com/choldgraf/myst-author/blob/main/upstream/README.md)).

## Use

```
npm install github:choldgraf/mystmd-client
```

```ts
import { parse, parseMyst, directives, roles } from 'mystmd-client/parse';
import { startMyst } from 'mystmd-client/start';
import { contentServer, mystmdMissing, type BuiltPage } from 'mystmd-client/content-server';

const { tree, frontmatter, messages } = parseMyst(text, { keepTitle: true });

const myst = await startMyst(root, log, ['--execute']); // log and args are optional
// myst: { url, ready, exited, stop }

const server = contentServer(myst.url);
const pages: BuiltPage[] = await server.pages();
const stopWatching = server.watch(onReload);
```

`parse` is the bare `mystParse` call with `linkify` and mystmd's extension directives and roles.
`parseMyst` also runs the transforms for a single page.

## Interface

Paths are in the [mystmd repository](https://github.com/jupyter-book/mystmd), and U-numbers are in [myst-author's upstream list](https://github.com/choldgraf/myst-author/blob/main/upstream/README.md).

- `parseMyst` runs mystmd's single-page transforms with the extensions mystmd enables by default (`packages/myst-cli/src/process/myst.ts` and `mdast.ts`).
- `directives` and `roles` list what `parseMyst` parses.
- A directive's children carry the directive's position, because directive transforms drop it (myst-author's upstream list, "Data and packaging gaps").
- `keepTitle: true` keeps a leading `# Title`, which mystmd removes (`keepTitleNode` in `packages/myst-cli/src/frontmatter.ts`).
- `messages` are the parse and transform messages.
- `startMyst` picks the port and serves at `http://127.0.0.1:<port>`, because `myst start` binds IPv6 `localhost` only otherwise (`packages/myst-cli/src/build/site/start.ts`).
- `ready` resolves when mystmd logs "Content server started", and rejects with `mystmdMissing` if mystmd isn't installed.
- `exited` rejects if mystmd dies or isn't installed.
- `pages()` reads each page's JSON from the content server, the index page first, because `myst.xref.json` isn't rewritten on edits and lacks `title` and `enumerator` (U1).
- `watch` calls back on every rebuild and on (re)connect (`/socket` in `packages/myst-cli/src/build/site/start.ts`).
- `watch` returns a function that stops it.
- `BuiltPage` has at least `location` and `mdast`.

## What it found

Replacing the two copies with this package:

| Repository | Change | Diff | Tests moved here | Command |
| --- | --- | --- | --- | --- |
| mystmd-lsp | deleted the copies in `src/mystmd/` | +32/−225 (without `package-lock.json`) | 2 | `git -C mystmd-lsp diff --shortstat 15a63dd..b6c390f -- . ':!package-lock.json'` |
| myst-author | deleted `packages/mystmd` | +51/−381 | 3 | `git -C myst-author diff --shortstat e567422..d17e991` |

The line counts come from those commands.
The two copies had drifted apart in 15 places before the merge.
The commit messages in this repo (`git log 418fe34..56f39fd`) explain how each was resolved.

## Where it could go next

A conformance check that compares `parseMyst` against what `myst build` produces.

## What it needs upstream

This package can be deleted once mystmd exports `parseMyst`, `startMyst` and `contentServer` ([U8](https://github.com/choldgraf/myst-author/blob/main/upstream/README.md)).

## What must stay in sync by hand

The package reaches into mystmd's internals: the parse pipeline, the transform plugins and the content server's JSON shape.

- `myst-parser` is pinned to an exact version in `package.json`, so the tokenizer and the conversion from tokens to mdast only change when we bump it.
  The directive and role definitions (`myst-directives`, `myst-roles`, `myst-ext-*`) and `myst-transforms` are caret ranges, so an install can still pick up newer ones.
- When bumping `mystmd`, check it still ships `myst-parser` 1.7.4, so `npm run test:mystmd` checks the parse against the same version.
- The parse options, extension list and transform order, copied from `packages/myst-cli/src/process/myst.ts` and `mdast.ts`.
- The position copy onto directive children, because directive transforms drop `position`.
- `HOST=127.0.0.1` when starting mystmd, because `myst start` binds IPv6 `localhost` only otherwise.
- The "Content server started" line that `ready` waits for, from `packages/myst-cli/src/build/site/start.ts`.
- The content server's routes (`/config.json`, `/content/<slug>.json`, `/socket`) and the `BuiltPage` fields we read.
- The node fields `rebaseUrls` rewrites (`image.url` and `urlOptimized`, `crossReference.dataUrl`, `output.jupyter_data.data[*].path`) and the `/content/` prefix it adds, which must match mystmd's page JSON.
- `savedHashes`, which must match how mystmd hashes a file for a page's `sha256`.
- Reading each page's JSON from the content server instead of `myst.xref.json`, which isn't rewritten on edits and has no `title` or `enumerator`.
