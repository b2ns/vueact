import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { hash } from '../utils.js';

const HTML_TPL = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="X-UA-Compatible" content="IE=edge" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>{{ html.title }}</title>
  </head>
  <body>
    <div id="app"></div>
  </body>
</html>
`;

export default (
  { events },
  { template, filename = 'index.html', define = {} } = {}
) => {
  let tpl = HTML_TPL;
  if (template) {
    tpl = readFileSync(template, { encoding: 'utf-8' });
  }

  // inject defined variable into template
  tpl = tpl.replace(/{{ *(\S*) *}}/g, (_, p1) => define[p1] || '');

  events.on('end', ({ output, shared, memfs, chunks }) => {
    const filepath = join(output, filename);
    const dir = dirname(filepath);
    if (!memfs && !existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    let code = tpl;

    // inject css code from css-loader
    if (shared.CSS_CODE) {
      const hashCode = hash(shared.CSS_CODE);
      const styleFilename = `__style_${hashCode}.css`;
      writeFileSync(join(dir, styleFilename), shared.CSS_CODE);
      code = code.replace(
        /<\/head>/g,
        `<link rel="stylesheet" href="${styleFilename}">\n</head>`
      );
    }

    // inject global script
    if (shared.GLOBAL_RUNTIME) {
      code = code.replace(
        /<\/head>/g,
        `<script>\n${shared.GLOBAL_RUNTIME}\n</script>\n</head>`
      );
    }

    // inject entry js file
    code = code.replace(
      /<\/body>/g,
      `<script type="module" src="${relative(
        dir,
        join(output, chunks.root.outpath)
      )}"></script>\n</body>`
    );

    if (memfs) {
      memfs.write(filepath, code);
    } else {
      writeFileSync(filepath, code);
    }
  });
};
