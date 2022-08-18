import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import pack from '../index.js';
import { isDef, parseArgs } from '../src/utils.js';

const Args = parseArgs(process.argv.slice(2));

let config = {};

if (Args.config) {
  config = (await import(Args.config)).default;
  delete Args.config;
} else {
  let dir = process.cwd();
  while (dir && dir !== '/') {
    const configFile = join(dir, 'pack.config.js');
    if (existsSync(configFile)) {
      config = (await import(configFile)).default;
      break;
    }
    dir = dirname(dir);
  }
}

for (const key in Args) {
  const val = Args[key];
  if (isDef(val)) {
    config[key] = val;
  }
}

pack(config);
