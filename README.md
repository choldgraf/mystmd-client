# mystmd-client

This package starts mystmd (`myst start`), reads its content server, and parses MyST with mystmd's own settings.
It replaces two copies of the same code that were kept in sync by hand, one in `mystmd-lsp` and one in `myst-author`.
It is installed from GitHub and never published to npm, because it goes away if mystmd exports these helpers itself (proposal U8 in [myst-author's upstream list](https://github.com/choldgraf/myst-author/blob/main/upstream/README.md)).

## Use

```
npm install github:choldgraf/mystmd-client
```

```ts
import { parseMyst } from 'mystmd-client/parse';
import { startMyst } from 'mystmd-client/start';
import { contentServer } from 'mystmd-client/content-server';
```

`parse` is the bare `mystParse` call with mystmd's extension directives and roles.
`parseMyst` also runs the transforms for a single page.

## What it found

Not measured yet.

## Where it could go next

A conformance check that compares `parseMyst` against what `myst build` produces.

## What it needs upstream

mystmd exporting these helpers, so this package can be deleted (U8, linked above).

## What must stay in sync by hand

- The position copy onto directive children, because directive transforms drop `position`.
- `HOST=127.0.0.1` when starting mystmd, because `myst start` binds IPv6 `localhost` only otherwise.
- Reading each page's JSON from the content server instead of `myst.xref.json`, which isn't rewritten on edits and has no `title` or `enumerator`.
