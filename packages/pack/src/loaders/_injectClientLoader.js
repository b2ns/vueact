import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createModule } from '../module.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default function createInjectClientLoader() {
  const code = readFileSync(join(__dirname, '../client/index.js'));
  const pathname = `/__client__.js`;
  const clientModule = createModule(pathname);
  clientModule.outpath = pathname;
  clientModule.raw = code;

  return {
    test: /\.js$/,
    exclude: /node_modules|\.json\.js$/,
    include: /\.css\.js$/,
    use: [
      ({ mod, createASTNode }) => {
        if (mod.injectedHMR) {
          return;
        }

        mod.injectedHMR = true;

        mod.addDep(clientModule);
        clientModule.addParent(mod);

        mod.ast.unshift(
          createASTNode(
            '',
            `import { createHMRContext as __createHMRContext__${
              mod.type === 'style' ? ', updateStyle as __updateStyle__' : ''
            } } from '${pathname}';
import.meta.hot = __createHMRContext__('${mod.id}');\n`
          )
        );
      },
    ],
  };
}
