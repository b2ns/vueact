import { readFileSync } from 'node:fs';

export default ({ mod, createASTNode }) => {
  mod.changeExtension('.json.js');

  if (mod.changing) {
    mod.ast = [
      createASTNode(
        '',
        `export default ${readFileSync(mod.id, { encoding: 'utf-8' })}`
      ),
    ];
  }
};
