import type { GenericParent } from 'myst-common';

// A client for the content server that `myst start` runs.
// mystmd doesn't export one, so this is it (myst-author upstream proposal U8 asks for that export).

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

/** The error message when mystmd isn't installed. `startMyst` rejects with it, and hosts that proxy the content server send it as the error body. */
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

/** The hashes a build of `text` may have. mystmd hashes the file as saved, and the saved file may have CRLF line breaks where an editor's text has `\n`, so this returns both. */
export const savedHashes = (text: string) => Promise.all([sha256(text), sha256(text.replaceAll('\n', '\r\n'))]);

export type ContentServer = ReturnType<typeof contentServer>;

/**
 * A client for the `myst start` content server at `base`.
 * `base` is an absolute URL such as `http://127.0.0.1:3100`, or a page-relative one such as `myst` when a host proxies the server.
 * `built()` rewrites image, output and hover-card URLs to start with `assets`, for when the page is shown somewhere that reaches the server by another URL.
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

  /** The built page JSON for a project-relative path, or null if mystmd hasn't built it. */
  async function page(path: string): Promise<BuiltPage | null> {
    const all = pageSlugs(await json('config.json'));
    const fetched = all.join() !== slugList && (await fetchPages(all));
    const slug = slugs.get('/' + path);
    if (!slug) return null;
    const result: BuiltPage = fetched ? fetched[all.indexOf(slug)] : await json(`content/${slug}.json`);
    rebaseUrls(result.mdast, assets);
    return result;
  }

  return {
    /** Every built page, the index page first. */
    async pages() {
      return fetchPages(pageSlugs(await json('config.json')));
    },

    /** `page(path)` as a `Built`, with any failure as its `error`. */
    built(path: string): Promise<Built> {
      return page(path).then((p) => ({ path, page: p }), (err) => ({ path, page: null, error: err.message }));
    },

    /** The project-relative file for a page slug (`''` for the index page), as of the last `pages()` or `built()`. */
    fileForSlug(slug: string) {
      for (const [location, s] of slugs) if (s === slug || !slug) return location.slice(1);
    },

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
// A cross-reference's `dataUrl`, which its hover card fetches, is root-relative too, but the server serves pages under `/content/`.
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

/** Rebase the URLs in a page that a hover card fetched from a cross-reference's `dataUrl` (`<base>/content/<slug>.json`), the way `built()` does. */
export function rebaseFetched(url: string, page: BuiltPage | undefined) {
  const i = url.lastIndexOf('/content/');
  if (i >= 0 && page?.mdast) rebaseUrls(page.mdast, url.slice(0, i));
}
