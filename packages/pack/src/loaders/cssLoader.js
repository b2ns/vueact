import { escape } from '@vueact/shared';
import { readFileSync } from 'fs';
import { hash, removeItem } from '../utils.js';

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
    mod.content = readFileSync(mod.id, 'utf-8');
    mod.styleId = mod.type + hash(mod.id);
    const node = createASTNode(
      mod.type,
      `(function () {
  const el = document.createElement('style');
  el.id = '${mod.styleId}';
  el.innerHTML = \`${escape(mod.content, '`\\')}\`;
  document.head.appendChild(el);
})();
`
    );

    const parent = mod.parents[0];
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
  } else {
    // extract style and load via html plugin
    if (!shared.CSS_CODE) {
      shared.CSS_CODE = '';
    }
    shared.CSS_CODE += readFileSync(mod.id, { encoding: 'utf-8' });
  }
};
