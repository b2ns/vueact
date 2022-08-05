import { readFileSync } from 'fs';
import { normalizeExtension } from '../utils.js';

export default ({ mod, createASTNode }) => {
  const { id, parents, changeExtension } = mod;
  changeExtension('js');
  for (const parent of parents) {
    for (const node of parent.ast) {
      if (node.absPath === id) {
        normalizeExtension(node);
      }
    }
  }
  mod.ast = [
    createASTNode(
      'other',
      `export default ${readFileSync(id, { encoding: 'utf-8' })}`
    ),
  ];
};
