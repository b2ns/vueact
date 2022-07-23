import config from './pack.config.js';
import pack from './pack.js';
import { parseArgs } from './utils.js';

const Args = parseArgs(process.argv.slice(2));

pack({ ...config, watch: Args.watch });
