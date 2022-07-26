import { readFileSync } from 'fs';

export default ({ id, parents, skipWrite, createASTNode }) => {
  skipWrite();

  if (!parents.length) {
    return;
  }

  const node = createASTNode(
    'inject-css',
    `(function () {
  const el = document.createElement('style');
  el.innerHTML = \`${readFileSync(id, { encoding: 'utf-8' })}\`;
  document.head.appendChild(el);
})();`
  );

  for (const parent of parents) {
    const { ast } = parent;
    ast.push(node);
  }
};
