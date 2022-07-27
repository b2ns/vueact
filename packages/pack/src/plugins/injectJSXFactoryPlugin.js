import { extname } from 'path';

export default (
  { events, createASTNode },
  { factoryName = 'h', libName = 'vueact' } = {}
) => {
  events.on('beforeModuleResolve', ({ module: { id, ast } }) => {
    if (extname(id) !== '.jsx') {
      return;
    }

    const node = createASTNode(
      'import',
      `import { ${factoryName} } from '${libName}';\n`,
      {
        pathname: libName,
      }
    );
    ast.unshift(node);
  });
};
