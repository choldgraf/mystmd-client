import type { GenericParent } from 'myst-common';

// A client exported by mystmd would replace this (myst-author upstream proposal U8).

/** The parts of a `myst start` page JSON (`/content/{slug}.json`) that we use. */
export type BuiltPage = { location: string; mdast: GenericParent };

/** The `myst start --headless` content server at `base`, e.g. `http://127.0.0.1:3100`. */
export function contentServer(base: string) {
  base = base.replace(/\/$/, '');
  let stopped = false;
  async function json(path: string) {
    const r = await fetch(`${base}/${path}`);
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  }

  return {
    /** Every built page, the index page first. */
    async pages(): Promise<BuiltPage[]> {
      const project = (await json('config.json')).projects[0];
      const slugs = [project.index, ...project.pages.map((p: { slug?: string }) => p.slug).filter(Boolean)];
      return Promise.all(slugs.map((s) => json(`content/${s}.json`)));
    },

    /** Call `onReload` whenever mystmd rebuilds (and on (re)connect), until `stop()`. */
    watch(onReload: () => void) {
      const connect = () => {
        if (stopped) return;
        const ws = new WebSocket(`${base.replace(/^http/, 'ws')}/socket`);
        ws.onopen = onReload;
        ws.onmessage = (e) => JSON.parse(String(e.data)).type === 'RELOAD' && onReload();
        ws.onclose = () => setTimeout(connect, 2000);
      };
      connect();
    },

    /** Stop reconnecting, e.g. once mystmd has exited. */
    stop() {
      stopped = true;
    },
  };
}
