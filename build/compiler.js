import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { basename, join } from 'path';
import { bundleStyle } from './bundleStyle.js';
import { compileJSX, isJSX } from './compileJSX.js';
import { transformImport } from './transformImport.js';
import { handleQuotedCode, isComment, isImport, isQuote, skipCommentCode } from './utils.js';

export function compile(sourceFile, output) {
  let sourceCode = readFileSync(sourceFile, { encoding: 'utf-8' });

  const styleFilenames = [];

  let code = '';

  let i = 0;
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
      code += quotedCode;
      i = nextIndex;
      continue;
    }

    if (isImport(sourceCode, i)) {
      const [importCode, nextIndex, extra = {}] = transformImport(sourceCode, i);

      if (extra.styleFilename) {
        styleFilenames.push(extra.styleFilename);
      }

      code += importCode;
      i = nextIndex;
      continue;
    }

    if (isJSX(char, nextChar)) {
      const [JSXCode, nextIndex] = compileJSX(sourceCode, i);
      code += JSXCode;
      i = nextIndex;
      continue;
    }

    code += char;
    i++;
  }

  code += bundleStyle(styleFilenames, sourceFile);

  if (!existsSync(output)) {
    mkdirSync(output);
  }
  writeFileSync(join(output, basename(sourceFile, '.jsx') + '.js'), code, { encoding: 'utf8' });
}
