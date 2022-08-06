import { escape } from '@vueact/shared';
import { readFileSync } from 'fs';

export default ({ mod, createASTNode }) => {
  mod.type = 'inject-style';
  mod.skipWrite();

  if (!mod.parents.length) {
    return;
  }

  const node = createASTNode(
    `inject-style`,
    `(function () {
  const el = document.createElement('style');
  el.innerHTML = \`${escape(
    readFileSync(mod.id, { encoding: 'utf-8' }),
    '`\\'
  )}\`;
  document.head.appendChild(el);
})();`
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
};
