import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { ensureArray } from '../utils.js';

export default ({ events }, opts) => {
  if (!opts) {
    return;
  }
  events.on('end', () => {
    opts = ensureArray(opts);
    for (const opt of opts) {
      const { from, to } = opt;
      const toDir = dirname(to);
      if (!existsSync(toDir)) {
        mkdirSync(toDir);
      }
      copyFileSync(from, to);
    }
  });
};
