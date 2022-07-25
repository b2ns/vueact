import { readdirSync, statSync, watch } from 'fs';
import { join } from 'path';

export const isRelative = (pathname) => pathname.startsWith('./') || pathname.startsWith('..');

export const isNodeBuiltin = (pathname) =>
  [
    'assert',
    'async_hooks',
    'buffer',
    'child_process',
    'cluster',
    'console',
    'constants',
    'crypto',
    'dgram',
    'diagnostics_channel',
    'dns',
    'domain',
    'events',
    'fs',
    'http',
    'http2',
    'https',
    'inspector',
    'module',
    'net',
    'os',
    'path',
    'perf_hooks',
    'process',
    'punycode',
    'querystring',
    'readline',
    'repl',
    'stream',
    'string_decoder',
    'timers',
    'tls',
    'trace_events',
    'tty',
    'url',
    'util',
    'v8',
    'vm',
    'wasi',
    'worker_threads',
    'zlib',
  ].includes(pathname);

export function parseArgs(args) {
  const res = { files: [] };
  for (const arg of args) {
    const segments = arg.split('=');
    if (segments.length === 2) {
      res[segments[0].replace(/^-*/, '')] = segments[1];
    } else if (arg.startsWith('-')) {
      res[arg.replace(/^-*/, '')] = true;
    } else {
      res.files.push(arg);
    }
  }
  return res;
}

export function recursiveWatch(dir, handler) {
  watch(dir, (event, filename) => handler(event, join(dir, filename)));
  const dirs = readdirSync(dir);
  for (let file of dirs) {
    file = join(dir, file);
    if (statSync(file).isDirectory()) {
      recursiveWatch(file, handler);
    }
  }
}
