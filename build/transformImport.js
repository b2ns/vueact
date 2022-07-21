import { extname } from 'path';
import { isNewLine } from './utils.js';

export function transformImport(sourceCode, index) {
  let code = '';

  let quote = '';
  let filename = '';
  let i = index;
  for (; i < sourceCode.length; i++) {
    const char = sourceCode[i];

    if (quote) {
      if (char === quote) {
        i++;
        break;
      }
      filename += char;
      continue;
    }

    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }

    code += char;
  }

  const ext = extname(filename);

  if (!ext) {
    return [`${code}'${filename}.js'`, i];
  }

  if (ext === '.jsx') {
    return [`${code}'${filename.replace(/\.jsx$/, '.js')}'`, i];
  }

  if (ext === '.css') {
    if (sourceCode[i] === ';') {
      i++;
    }
    if (isNewLine(sourceCode[i])) {
      i++;
    }
    return ['', i, { styleFilename: filename }];
  }

  return [`${code}'${filename}'`, i];
}
