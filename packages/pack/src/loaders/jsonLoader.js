import { readFileSync } from 'fs';

export default ({ mod, createASTNode }) => {
  mod.changeExtension('.js');

  mod.ast = [
    createASTNode(
      '',
      `export default ${readFileSync(mod.id, { encoding: 'utf-8' })}`
    ),
  ];
};
