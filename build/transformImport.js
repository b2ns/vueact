import { extname } from 'path';
import { handleQuotedCode, isComment, isNewLine, isQuote, skipCommentCode } from './utils.js';

export function transformImport(sourceCode, index) {
  let code = '';

  let filename = '';

  let i = index;
  while (i < sourceCode.length) {
    const char = sourceCode[i];
    const nextChar = sourceCode[i + 1];

    if (isComment(char, nextChar)) {
      const [_, nextIndex] = skipCommentCode(sourceCode, i);
      i = nextIndex;
      continue;
    }

    if (isQuote(char)) {
      const [quotedCode, nextIndex] = handleQuotedCode(sourceCode, i);
      filename = quotedCode.slice(1, -1);
      i = nextIndex;
      break;
    }

    code += char;
    i++;
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
