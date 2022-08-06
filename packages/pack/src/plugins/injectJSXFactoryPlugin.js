import { extname } from 'path';

export default (
  { events, createASTNode },
  { factoryName = 'h', libName = 'vueact' } = {}
) => {
  events.on('beforeModuleResolve', ({ mod }) => {
    if (extname(mod.id) !== '.jsx') {
      return;
    }

    const node = createASTNode(
      'import',
      `import { ${factoryName} } from '${libName}';\n`,
      {
        pathname: libName,
      }
    );
    mod.ast.unshift(node);
  });
};
