import { extname } from 'node:path';

export default ({ events }, { factoryName = 'h', libName = 'vueact' } = {}) => {
  events.on('beforeModuleResolve', ({ mod }) => {
    if (extname(mod.id) !== '.jsx') {
      return;
    }

    mod.raw = `import { ${factoryName} } from '${libName}';\n` + mod.raw;
  });
};
