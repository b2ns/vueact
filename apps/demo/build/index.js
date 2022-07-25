import pack from '@vueact/pack';
import { parseArgs } from '@vueact/shared/src/node-utils.js';
import config from './pack.config.js';

const Args = parseArgs(process.argv.slice(2));

pack({ ...config, watch: Args.watch });
