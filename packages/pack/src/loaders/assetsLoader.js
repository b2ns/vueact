import { removeItem } from '../utils.js';

export default ({ mod, createASTNode, watch }) => {
  if (!watch) {
    mod.outpath = mod.outpath.replace(/\.(\w+)$/, `_${mod.hash}.$1`);
  }

  mod.walkParentASTNode((node, ast) => {
    const imported = node.imported[0];
    removeItem(
      ast,
      node,
      createASTNode('', `const ${imported.name} = '${mod.outpath}';`)
    );
  });
};
