import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { basename, join } from 'path';
import { bundleStyle } from './bundleStyle.js';
import { compileJSX, isJSX } from './compileJSX.js';
import { transformImport } from './transformImport.js';
import { CommentTypes, isImport, isNewLine } from './utils.js';

export function compile(sourceFile, output) {
  let sourceCode = readFileSync(sourceFile, { encoding: 'utf-8' });

  const styleFilenames = [];

  let commentFlag = false;
  let commentType = '';

  let code = '';

  let i = 0;
  while (i < sourceCode.length) {
    const char = sourceCode[i];
    const nextChar = sourceCode[i + 1];

    if (commentFlag) {
      if (commentType === CommentTypes.MULTI_LINE) {
        if (char === '*' && nextChar === '/') {
          commentFlag = false;
        }
      } else {
        if (isNewLine(char)) {
          commentFlag = false;
        }
      }
      code += char;
      i++;
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

    if (char === '/' && (nextChar === '*' || nextChar === '/')) {
      commentFlag = true;
      commentType = nextChar === '*' ? CommentTypes.MULTI_LINE : CommentTypes.ONE_LINE;
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
