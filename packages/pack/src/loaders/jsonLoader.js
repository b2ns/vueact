import { readFileSync } from 'fs';

export default ({ mod, createASTNode }) => {
  mod.changeExtension('.json.js');

  mod.ast = [
    createASTNode(
      '',
      `export default ${readFileSync(mod.id, { encoding: 'utf-8' })}`
    ),
  ];
};
