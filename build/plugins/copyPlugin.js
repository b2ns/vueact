import { copyFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';

export default (_, opts) => {
  if (!opts) {
    return;
  }
  if (!Array.isArray(opts)) {
    opts = [opts];
  }
  for (const opt of opts) {
    const { from, to } = opt;
    const toDir = dirname(to);
    if (!existsSync(toDir)) {
      mkdirSync(toDir);
    }
    copyFileSync(from, to);
  }
};
