import { existsSync, readFileSync } from 'fs';
import { dirname, extname, join } from 'path';

export function bundleStyle(styleFilenames, sourceFile) {
  let code = '';
  if (styleFilenames.length) {
    for (let file of styleFilenames) {
      file = join(dirname(sourceFile), file);
      code += readFileSync(file, { encoding: 'utf-8' });
    }
  } else {
    const file = sourceFile.replace(extname(sourceFile), '.css');

    if (existsSync(file)) {
      code += readFileSync(file, { encoding: 'utf-8' });
    }
  }

  if (code) {
    return `
(function () {
  const el = document.createElement('style');
  el.innerHTML = \`${code}\`;
  document.head.appendChild(el);
})()`;
  }
  return '';
}
