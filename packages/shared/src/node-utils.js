import { readdirSync, statSync, watch } from 'fs';
import os from 'os';
import { join } from 'path';
import { builtinModules } from 'module';

export const isLinux = os.type() === 'Linux';
export const isMac = os.type() === 'Darwin';
export const isWin = os.type() === 'Windows_NT';

const builtinModuleSet = builtinModules.reduce((s, mod) => {
  s.add(mod, true);
  s.add(`node:${mod}`, true);
  return s;
}, new Set());
export const isBuiltin = (pathname) => builtinModuleSet.has(pathname);

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
  // only linux need polyfill
  if (isLinux) {
    watch(dir, (event, filename) => handler(event, join(dir, filename)));
    const dirs = readdirSync(dir);
    for (let file of dirs) {
      file = join(dir, file);
      if (statSync(file).isDirectory()) {
        recursiveWatch(file, handler);
      }
    }
  } else {
    watch(dir, { recursive: true }, (event, filename) =>
      handler(event, join(dir, filename))
    );
  }
}
