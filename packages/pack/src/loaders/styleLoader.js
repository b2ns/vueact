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
    if (!parent.__injectedStyle__) {
      parent.__injectedStyle__ = new WeakMap();
    }
    const oldNode = parent.__injectedStyle__.get(mod);
    if (oldNode) {
      oldNode.rawCode = node.rawCode;
    } else {
      ast.push(node);
      parent.__injectedStyle__.set(mod, node);
    }
  }
};
