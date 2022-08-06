import { escape } from '@vueact/shared';
import { readFileSync } from 'fs';

export default ({ mod, createASTNode }) => {
  mod.skipWrite();

  if (!mod.parents.length) {
    return;
  }

  const node = createASTNode(
    'inject-css',
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
    ast.push(node);
  }
};
