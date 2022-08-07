import { escape } from '@vueact/shared';
import { readFileSync } from 'fs';
import { removeItem } from '../utils.js';

export default ({ mod, createASTNode, watch, shared }) => {
  mod.walkParentASTNode((node, ast) => {
    removeItem(ast, node);
  });

  mod.type = watch ? 'inject-style' : 'css';
  mod.skipWrite();

  if (!mod.parents.length) {
    return;
  }

  if (watch) {
    // load via style element
    const node = createASTNode(
      `inject-style`,
      `(function () {
  const el = document.createElement('style');
  el.innerHTML = \`${escape(
    readFileSync(mod.id, { encoding: 'utf-8' }),
    '`\\'
  )}\`;
  document.head.appendChild(el);
})();
`
    );

    for (const parent of mod.parents) {
      const { ast } = parent;
      if (!ast.__injectedStyle__) {
        ast.__injectedStyle__ = new WeakMap();
      }
      const oldNode = ast.__injectedStyle__.get(mod);
      if (oldNode) {
        oldNode.rawCode = node.rawCode;
      } else {
        ast.push(node);
        ast.__injectedStyle__.set(mod, node);
      }
    }
  } else {
    // extract style and load via html plugin
    if (!shared.CSS_CODE) {
      shared.CSS_CODE = '';
    }
    shared.CSS_CODE += readFileSync(mod.id, { encoding: 'utf-8' });
  }
};
