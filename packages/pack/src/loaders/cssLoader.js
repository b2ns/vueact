import { escape } from '@vueact/shared';
import { readFileSync } from 'node:fs';
import { createASTNode, removeItem } from '../utils.js';

export default ({ mod, dev, shared }) => {
  if (dev) {
    mod.changeExtension('.css.js');
    if (mod.changing) {
      mod.type = 'style';
      const escapedCnt = escape(readFileSync(mod.id, 'utf-8'), '`\\');
      mod.raw = escapedCnt;
      mod.ast = [
        createASTNode(
          '',
          `const css = \`${escapedCnt}\`;
__updateStyle__('${mod.id}', css);
export default css;\n`
        ),
      ];
    }
  } else {
    mod.type = 'css';
    mod.skipWrite();
    mod.walkParentASTNode((node, ast) => {
      removeItem(ast, node);
    });
    // extract style and load via html plugin
    if (!shared.CSS_CODE) {
      shared.CSS_CODE = '';
    }
    shared.CSS_CODE += readFileSync(mod.id, 'utf-8');
  }
};
