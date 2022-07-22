import config from './pack.config.js';
import pack from './pack.js';
import { parseArgs } from './utils.js';

const args = parseArgs(process.argv.slice(2));
const entry = args.files[0];
const output = args.output;
const isWatch = args.watch;

pack({
  ...config,
  entry: entry || config.entry,
  output: output || config.output,
});
