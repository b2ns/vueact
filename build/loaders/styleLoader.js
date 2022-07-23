import { readFileSync } from 'fs';

export default ({ absPath, parents, noWrite }) => {
  noWrite();

  if (!parents.length) {
    return;
  }

  const node = {
    code: `
(function () {
  const el = document.createElement('style');
  el.innerHTML = \`${readFileSync(absPath, { encoding: 'utf-8' })}\`;
  document.head.appendChild(el);
})();`,
  };

  for (const parent of parents) {
    const { ast } = parent;
    ast.push(node);
  }
};
