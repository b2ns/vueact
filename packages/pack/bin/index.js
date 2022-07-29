import { existsSync } from 'fs';
import { dirname, join } from 'path';
import pack from '../src/pack.js';
import { parseArgs } from '../src/utils.js';

const Args = parseArgs(process.argv.slice(2));

let config = null;

if (Args.config) {
  config = (await import(Args.config)).default;
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

if (!config) {
  console.error(`pack: can not find a configuration file 'pack.config.js'`);
  process.exit(1);
}

pack({ ...config, watch: Args.watch });
