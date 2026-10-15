import { spawn } from 'node:child_process';
import { createServer, type AddressInfo } from 'node:net';
import { createInterface } from 'node:readline';
import { mystmdMissing } from './content-server.ts';

// Starts `myst start --headless` for its content server.
// mystmd doesn't export a launcher, so this is one (myst-author upstream proposal U8 asks for that export).

/** A port that's free on 127.0.0.1 right now. */
function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = createServer().on('error', reject).listen(0, '127.0.0.1', () => {
      const { port } = s.address() as AddressInfo;
      s.close(() => resolve(port));
    });
  });
}

export type Myst = Awaited<ReturnType<typeof startMyst>>;

/**
 * Run `myst start --headless` in `root`.
 * We pick the port, so `url` is known before the first build. `ready` resolves once the content server is serving.
 * `exited` rejects when mystmd dies, including after `stop`. Both reject with `mystmdMissing` if mystmd isn't installed.
 * Each line of mystmd's output goes to `log`. `args` are passed to `myst start`, for example `--execute`.
 */
export async function startMyst(root: string, log = console.log, args: string[] = []) {
  const port = await freePort();
  // myst reads PORT as its theme server's port, so drop it.
  // Set HOST so myst doesn't bind only IPv6 `localhost`, which proxies like code-server's can't reach.
  const { PORT, ...rest } = process.env;
  const env = { ...rest, HOST: '127.0.0.1' };
  const child = spawn(process.env.MYST_BIN ?? 'myst', ['start', '--headless', '--server-port', String(port), ...args], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
  const stop = () => child.kill();
  process.on('exit', stop);

  const exited = new Promise<never>((_, reject) => {
    child.on('error', (err: NodeJS.ErrnoException) => reject(err.code === 'ENOENT' ? new Error(mystmdMissing) : err));
    child.on('close', (code) => reject(new Error(`myst exited with code ${code}`)));
  });
  const ready = new Promise<void>((resolve, reject) => {
    exited.catch(reject);
    for (const stream of [child.stdout, child.stderr]) {
      createInterface({ input: stream }).on('line', (line) => {
        log(`[myst] ${line}`);
        if (line.includes('Content server started')) resolve();
      });
    }
  });
  // A caller that never awaits these must not get an unhandled rejection when mystmd is missing.
  exited.catch(() => {});
  ready.catch(() => {});
  return { url: `http://127.0.0.1:${port}`, ready, exited, stop };
}
