import { removeItem } from '../utils.js';

export default ({ mod: { id, parents, outpath }, createASTNode }) => {
  for (const parent of parents) {
    const { ast } = parent;
    for (const node of ast) {
      if (node.absPath === id) {
        const imported = node.imported[0];
        removeItem(
          ast,
          node,
          createASTNode('other', `const ${imported.name} = '${outpath}';`)
        );
      }
    }
  }
};
