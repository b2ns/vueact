import { removeItem } from '../utils.js';

export default ({ id, parents }) => {
  if (!parents.length) {
    return;
  }
  for (const parent of parents) {
    const { ast } = parent;
    for (const node of ast) {
      if (node.type === 'import') {
        if (node.absPath === id) {
          removeItem(ast, node);
        }
      }
    }
  }
};
