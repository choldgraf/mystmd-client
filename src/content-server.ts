import type { GenericParent } from 'myst-common';

// A client for the content server that `myst start` runs.
// mystmd doesn't export one yet.
// myst-author's upstream proposal U8 asks for that export: https://github.com/choldgraf/myst-author/blob/main/upstream/README.md

/**
 * The parts of a `myst start` page JSON (`/content/{slug}.json`) that we use.
 * This shape is mystmd's internal format, not a public API, so a minor mystmd release can change it.
 */
export type BuiltPage = {
  sha256: string;
  location: string;
  frontmatter?: Record<string, any>;
  mdast: GenericParent;
  references?: Record<string, any>;
};

/** mystmd's latest build of a file, or why there is none. */
export type Built = { path: string; page: BuiltPage | null; error?: string };

/** An entry of the project's table of contents. A part or an external link has no `file`. `level` is its depth, starting at 1. */
export type TocEntry = { title: string; level: number; file?: string };

/**
 * The error message when mystmd isn't installed.
 * `startMyst` rejects with it.
 * Hosts that proxy the content server send it as the error body.
 */
export const mystmdMissing = 'mystmd not found (install it, or set MYST_BIN)';

/** Slugs of every page in a `myst start` project, from its `/config.json`, with the index page first. */
function pageSlugs(config: any): string[] {
  const project = config.projects[0];
  return [project.index, ...project.pages.map((p: { slug?: string }) => p.slug).filter(Boolean)];
}

/** Hex SHA-256 of the text, as mystmd records it in page JSON. */
export async function sha256(text: string) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * The two hashes a build of `text` may have, one with `\n` line breaks and one with CRLF.
 * mystmd hashes the file as saved, which may use CRLF where the editor's text has `\n`.
 */
export const savedHashes = (text: string) => Promise.all([sha256(text), sha256(text.replaceAll('\n', '\r\n'))]);

export type ContentServer = ReturnType<typeof contentServer>;

/**
 * A client for the `myst start` content server at `base`.
 * `base` is an absolute URL such as `http://127.0.0.1:3100`.
 * When a host proxies the server, it can be a page-relative URL such as `myst`.
 * `built()` rewrites image, output and hover-card URLs to start with `assets`.
 * Set `assets` when the page is shown somewhere that reaches the server by another URL.
 */
export function contentServer(base: string, assets = base) {
  base = base.replace(/\/$/, '');
  // config.json lists slugs but not files, so each page is fetched once to learn which file it came from.
  let slugs = new Map<string, string>();
  let slugList = '';

  async function json(path: string) {
    const r = await fetch(`${base}/${path}`);
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  }

  /** Fetch the pages with these slugs and record each page's file. */
  async function fetchPages(all: string[]) {
    const result: BuiltPage[] = await Promise.all(all.map((s) => json(`content/${s}.json`)));
    slugs = new Map(result.map((p, i) => [p.location, all[i]]));
    slugList = all.join();
    return result;
  }

  /** Fetch the pages again if `config` lists different ones than last time. */
  async function sync(config: any) {
    const all = pageSlugs(config);
    if (all.join() !== slugList) await fetchPages(all);
  }

  /** The project-relative file for a page slug, as of the last fetch. The empty slug `''` means the index page. */
  function fileForSlug(slug: string) {
    for (const [location, s] of slugs) if (s === slug || !slug) return location.slice(1);
  }

  /** The built page JSON for a project-relative path, or null if mystmd hasn't built it. */
  async function page(path: string): Promise<BuiltPage | null> {
    await sync(await json('config.json'));
    const slug = slugs.get('/' + path);
    if (!slug) return null;
    const result: BuiltPage = await json(`content/${slug}.json`);
    rebaseUrls(result.mdast, assets);
    return result;
  }

  return {
    /** Every built page, the index page first. */
    async pages() {
      return fetchPages(pageSlugs(await json('config.json')));
    },

    /** Like `page(path)`, but returns a `Built` with any failure as its `error` instead of throwing. */
    built(path: string): Promise<Built> {
      return page(path).then((p) => ({ path, page: p }), (err) => ({ path, page: null, error: err.message }));
    },

    /** The table of contents from `config.json`, in the order mystmd shows it, with the index page first. */
    async toc(): Promise<TocEntry[]> {
      const config = await json('config.json');
      await sync(config);
      const project = config.projects[0];
      // config.json has the index page's slug but not its title.
      // The project's `title` there is the project's own, so read the page's title from the page itself.
      const index: BuiltPage = await json(`content/${project.index}.json`);
      const pages: { title: string; level?: number; slug?: string }[] = project.pages;
      return [{ title: index.frontmatter?.title ?? index.location.slice(1), level: 1, file: index.location.slice(1) }, ...pages.map((p) => ({ title: p.title, level: p.level ?? 1, file: p.slug && fileForSlug(p.slug) }))];
    },

    fileForSlug,

    /** Call `onReload` whenever mystmd rebuilds, and whenever the socket connects or reconnects. Returns a function that stops watching. */
    watch(onReload: () => void) {
      const url = new URL(`${base}/socket`, globalThis.location?.href).href.replace(/^http/, 'ws');
      let ws: WebSocket;
      let timer: ReturnType<typeof setTimeout>;
      let stopped = false;
      const connect = () => {
        ws = new WebSocket(url);
        ws.onopen = onReload;
        ws.onmessage = (e) => JSON.parse(String(e.data)).type === 'RELOAD' && onReload();
        ws.onclose = () => { if (!stopped) timer = setTimeout(connect, 2000); };
      };
      connect();
      return () => { stopped = true; clearTimeout(timer); ws.close(); };
    },
  };
}

// Page JSON refers to images and code cell outputs by root-relative URLs such as `/local-<hash>.png`.
// A cross-reference's hover card fetches its `dataUrl`, which is root-relative too.
// The server serves those pages under `/content/`, so `dataUrl` also gets that prefix.
function rebaseUrls(node: any, base: string) {
  if (node.type === 'image') {
    for (const key of ['url', 'urlOptimized']) if (node[key]?.startsWith('/')) node[key] = base + node[key];
  }
  if (node.type === 'crossReference' && node.dataUrl?.startsWith('/')) node.dataUrl = `${base}/content${node.dataUrl}`;
  if (node.type === 'output') {
    for (const d of Object.values<any>(node.jupyter_data?.data ?? {})) if (d.path?.startsWith('/')) d.path = base + d.path;
  }
  node.children?.forEach((c: any) => rebaseUrls(c, base));
}

/**
 * Rebase the URLs in a page that a hover card fetched, the way `built()` does.
 * `url` is the cross-reference's `dataUrl` it came from, which looks like `<base>/content/<slug>.json`.
 */
export function rebaseFetched(url: string, page: BuiltPage | undefined) {
  const i = url.lastIndexOf('/content/');
  if (i >= 0 && page?.mdast) rebaseUrls(page.mdast, url.slice(0, i));
}
