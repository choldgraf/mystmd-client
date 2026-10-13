import { spawn } from 'node:child_process';
import { createServer, type AddressInfo } from 'node:net';
import { createInterface } from 'node:readline';
import { mystmdMissing } from './content-server.ts';

// Starts `myst start --headless` for its content server; a launcher exported by mystmd would replace this (myst-author upstream proposal U8).

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
 * We pick the port, so `url` (the content server) is known before the first build; `ready` resolves once it's serving.
 * `exited` rejects if mystmd dies, including after `stop`; it and `ready` reject with the message `mystmdMissing` if mystmd isn't installed.
 * mystmd's output goes to `log`, a line at a time. `args` go to `myst start`, such as `--execute`.
 */
export async function startMyst(root: string, log = console.log, args: string[] = []) {
  const port = await freePort();
  // myst reads PORT as its own theme-server port. Pin HOST so it doesn't bind IPv6-only `localhost`, which proxies like code-server's miss.
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
  // Callers that don't wait for mystmd mustn't crash when it's missing.
  exited.catch(() => {});
  ready.catch(() => {});
  return { url: `http://127.0.0.1:${port}`, ready, exited, stop };
}
