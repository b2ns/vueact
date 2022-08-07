import { removeItem } from '../utils.js';

export default ({ mod, createASTNode }) => {
  mod.walkParentASTNode((node, ast) => {
    const imported = node.imported[0];
    removeItem(
      ast,
      node,
      createASTNode('', `const ${imported.name} = '${mod.outpath}';`)
    );
  });
};