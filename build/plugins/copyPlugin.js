import { copyFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { ensureArray } from '../utils.js';

export default (_, opts) => {
  if (!opts) {
    return;
  }
  opts = ensureArray(opts);
  for (const opt of opts) {
    const { from, to } = opt;
    const toDir = dirname(to);
    if (!existsSync(toDir)) {
      mkdirSync(toDir);
    }
    copyFileSync(from, to);
  }
};
