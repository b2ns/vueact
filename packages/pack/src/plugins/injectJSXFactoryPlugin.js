import { extname } from 'node:path';

export default ({ events }, { factoryName = 'h', libName = 'vueact' } = {}) => {
  events.on('beforeModuleResolve', ({ mod }) => {
    if (extname(mod.id) !== '.jsx') {
      return;
    }

    mod.content =
      `import { ${factoryName} } from '${libName}';\n` + mod.content;
  });
};
