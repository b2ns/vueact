import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join, relative } from 'path';

const HTML_TPL = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="X-UA-Compatible" content="IE=edge" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title><%= html.title %></title>
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
  tpl = tpl.replace(/<%= (\S*) %>/g, (_, p1) => define[p1] || '');

  events.on('end', ({ output, graph }) => {
    const filepath = join(output, filename);
    const dir = dirname(filepath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    const code = tpl.replace(
      /<\/body>/g,
      `<script type="module" src="${relative(
        dir,
        join(output, graph.outpath)
      )}"></script></body>`
    );
    writeFileSync(filepath, code);
  });
};
