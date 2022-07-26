import { changeExtension, open } from '@vueact/shared/src/node-utils.js';
import { existsSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, extname, isAbsolute, join } from 'node:path';
export * from '@vueact/shared';
export * from '@vueact/shared/src/node-utils.js';
const require = createRequire(import.meta.url);

export const CommentTypes = {
  ONE_LINE: '/',
  MULTI_LINE: '*',
};

export const QuoteTypes = {
  SINGLE: `'`,
  DOUBLE: `"`,
  BACK: '`',
};

export const isComment = (char, nextChar) =>
  char === '/' &&
  (nextChar === CommentTypes.ONE_LINE || nextChar === CommentTypes.MULTI_LINE);

export const isQuote = (char) =>
  char === QuoteTypes.SINGLE ||
  char === QuoteTypes.DOUBLE ||
  char === QuoteTypes.BACK;

export const isWord = (char) => /\w/.test(char);

export const isBlank = (char) => /\s/.test(char);

export const isNewLine = (char) => /[\n\r]/.test(char);

export function isImport(code, index) {
  if (isTheWord('import', code, index)) {
    let i = 'import'.length + index;
    while (i < code.length) {
      const char = code[i];
      if (char === '.') {
        return false;
      } else if (isQuote(char)) {
        return true;
      }
      i++;
    }
    return true;
  }

  return false;
}

export function isReExport(code, index) {
  if (isExport(code, index)) {
    let inCurly = false;
    let i = index + 'export'.length;
    while (i < code.length) {
      const char = code[i];
      if (inCurly) {
        if (char === '}') {
          inCurly = false;
        }
        i++;
        continue;
      }
      if (char === '{') {
        inCurly = true;
        i++;
        continue;
      }
      if (isTheWord('as', code, i) || isTheWord('from', code, i)) {
        return true;
      }
      if (!isBlank(char) && char !== '*') {
        return false;
      }
      i++;
    }
  }
  return false;
}

export function isExport(code, index) {
  return isTheWord('export', code, index);
}

/* module.exports = Default
 * module.exports.foo = foo
 * exports.bar = bar
 * exports['foo-bar'] = foobar
 */
export function isExports(code, index) {
  return isTheWord('exports', code, index);
}

export function isRequire(code, index) {
  if (isTheWord('require', code, index)) {
    let i = index + 7;
    while (i < code.length) {
      const char = code[i];
      if (char === '(') {
        return true;
      }
      if (!isBlank(char)) {
        return false;
      }
      i++;
    }
  }
  return false;
}

export function isEnvIf(code, index) {
  const key = 'process.env.NODE_ENV';
  let flag = false;
  if (isTheWord('if', code, index)) {
    let i = index + 3;
    while (i < code.length) {
      const char = code[i];
      if (flag) {
        if (char === ')') {
          return true;
        }
        if (char === '&' || char === '|') {
          return false;
        }
        i++;
        continue;
      }
      if (isTheWord(key, code, i)) {
        flag = true;
        i += key.length;
        continue;
      }
      if (!isBlank(char) && char !== '!' && char !== '(') {
        return false;
      }
      i++;
    }
  }
  return false;
}

export function isTheWord(word, code, index) {
  let res = !isWord(code[index - 1] || '');
  if (!res) return res;
  let i = 0;
  for (; i < word.length; i++) {
    const char = word[i];
    res = res && char === code[index + i];
    if (!res) return res;
  }
  res = res && !isWord(code[index + i]);
  return res;
}

export const isRelative = (pathname) =>
  pathname === '.' || pathname.startsWith('./') || pathname.startsWith('..');

export const isPkg = (pathname) =>
  !isAbsolute(pathname) && !isRelative(pathname);

export function handleCommentCode(sourceCode, index) {
  let code = '';
  const commentType =
    sourceCode[index + 1] === CommentTypes.MULTI_LINE
      ? CommentTypes.MULTI_LINE
      : CommentTypes.ONE_LINE;

  let i = index;
  while (i < sourceCode.length) {
    const char = sourceCode[i];
    const nextChar = sourceCode[i + 1];

    if (commentType === CommentTypes.MULTI_LINE) {
      if (char === CommentTypes.MULTI_LINE && nextChar === '/') {
        code += char;
        code += nextChar;
        i += 2;
        break;
      }
    } else {
      if (isNewLine(char)) {
        code += char;
        i++;
        break;
      }
    }

    code += char;
    i++;
  }

  return [code, i];
}

export function handleQuotedCode(sourceCode, index) {
  let code = sourceCode[index];
  const quoteType = sourceCode[index];

  let i = index + 1;
  while (i < sourceCode.length) {
    const prevChar = sourceCode[i - 1];
    const char = sourceCode[i];

    code += char;
    i++;

    if (prevChar !== '\\' && char === quoteType) {
      break;
    }
  }

  return [code, i];
}

export function resolveModuleImport(sourceCode) {
  sourceCode = removeEnvCode(sourceCode);

  let _isImport = false;
  const ast = [];
  let code = '';
  let isCJS = true;

  function stageOtherCode() {
    if (code) {
      ast.push(createASTNode('', code));
      code = '';
    }
  }

  let i = 0;
  while (i < sourceCode.length) {
    const char = sourceCode[i];
    const nextChar = sourceCode[i + 1];

    if (isComment(char, nextChar)) {
      const [commentCode, nextIndex] = handleCommentCode(sourceCode, i);
      code += commentCode;
      i = nextIndex;
      continue;
    }

    if (isQuote(char)) {
      const [quotedCode, nextIndex] = handleQuotedCode(sourceCode, i);
      code += quotedCode;
      i = nextIndex;
      continue;
    }

    if ((_isImport = isImport(sourceCode, i)) || isReExport(sourceCode, i)) {
      isCJS = false;
      stageOtherCode();
      const [{ code: rawCode, pathname, imported }, nextIndex] =
        resolveESMImport(sourceCode, i, _isImport ? 'import' : 'export');

      ast.push(
        createASTNode('import', rawCode, {
          pathname,
          reExport: !_isImport,
          imported,
        })
      );

      i = nextIndex;
      continue;
    }

    if (isCJS && isExport(sourceCode, i)) {
      isCJS = false;
    }

    if (isRequire(sourceCode, i)) {
      stageOtherCode();
      const [{ code: rawCode, pathname }, nextIndex] = resolveCJSRequire(
        sourceCode,
        i
      );

      ast.push(createASTNode('import', rawCode, { pathname }));

      i = nextIndex;
      continue;
    }

    code += char;
    i++;
  }
  stageOtherCode();

  return { ast, isCJS };
}

export function removeEnvCode(sourceCode) {
  let code = '';

  let i = 0;
  while (i < sourceCode.length) {
    const char = sourceCode[i];
    const nextChar = sourceCode[i + 1];

    if (isComment(char, nextChar)) {
      const [commentCode, nextIndex] = handleCommentCode(sourceCode, i);
      code += commentCode;
      i = nextIndex;
      continue;
    }

    if (isQuote(char)) {
      const [quotedCode, nextIndex] = handleQuotedCode(sourceCode, i);
      code += quotedCode;
      i = nextIndex;
      continue;
    }

    if (isEnvIf(sourceCode, i)) {
      const [rawCode, nextIndex] = resolveEnvIf(sourceCode, i);

      code += rawCode;

      i = nextIndex;
      continue;
    }

    code += char;
    i++;
  }

  return code;
}

class ASTNode {
  constructor(type, rawCode) {
    this.type = type || 'other';
    this.rawCode = rawCode;
  }
}

class ImportASTNode extends ASTNode {
  constructor(type, rawCode, { pathname, imported, reExport = false }) {
    super(type, rawCode);
    this.code = rawCode;
    this.rawPathname = pathname;
    this.pathname = pathname;
    this.absPath = pathname;
    this.imported = imported;
    this.reExport = reExport;
  }

  setPathname(pathname) {
    if (!pathname) {
      return;
    }
    this.code = this.code.replace(
      new RegExp(`(?<='|")${this.pathname}(?='|")`),
      pathname
    );
    this.pathname = pathname;
  }

  changeExtension(ext) {
    this.setPathname(changeExtension(this.pathname, ext));
  }
}

export function createASTNode(type, rawCode, extra = {}) {
  switch (type) {
    case 'import':
      return new ImportASTNode(type, rawCode, extra);
    default:
      return new ASTNode(type, rawCode);
  }
}

export function resolveESMImport(sourceCode, index, keyword) {
  let code = keyword;
  let pathname = '';
  const imported = [];

  let curlyStart = false;
  let curlyEnd = true;

  let nameFlag = true;
  let nameVal = '';

  let aliasFlag = false;
  let aliasVal = '';

  let i = index + keyword.length;
  while (i < sourceCode.length) {
    const char = sourceCode[i];
    const nextChar = sourceCode[i + 1];

    if (isComment(char, nextChar)) {
      const [commentCode, nextIndex] = handleCommentCode(sourceCode, i);
      code += commentCode;
      i = nextIndex;
      continue;
    }

    if (isQuote(char)) {
      const [quotedCode, nextIndex] = handleQuotedCode(sourceCode, i);
      nameFlag = false;
      if (curlyStart) {
        imported.push({ name: quotedCode });
      } else {
        pathname = quotedCode.slice(1, -1);
      }
      code += quotedCode;
      i = nextIndex;
      continue;
    }

    if (char === '*') {
      nameFlag = false;
      imported.push({ importAll: true, name: '*' });
      code += char;
      i++;
      continue;
    }

    if (char === '{') {
      curlyStart = true;
      curlyEnd = false;
      code += char;
      i++;
      continue;
    }

    if (char === '}') {
      curlyStart = false;
      curlyEnd = true;
      code += char;
      i++;
      continue;
    }

    if (isTheWord('as', sourceCode, i)) {
      aliasFlag = true;
      code += 'as';
      i += 2;
      continue;
    }

    if (aliasFlag) {
      if (isWord(char)) {
        aliasVal += char;
      } else if (aliasVal) {
        imported[imported.length - 1].alias = aliasVal;
        aliasVal = '';
        aliasFlag = false;
      }

      code += char;
      i++;
      continue;
    }

    if (nameFlag) {
      if (isWord(char)) {
        nameVal += char;
      } else if (nameVal) {
        const node = { name: nameVal };
        if (!curlyStart || nameVal === 'default') {
          node.default = true;
        }
        imported.push(node);
        nameVal = '';
        nameFlag = false;
      }

      code += char;
      i++;
      continue;
    }

    if (!curlyEnd && isWord(char)) {
      nameFlag = true;
      continue;
    }

    if (pathname && (char === ';' || isNewLine(char))) {
      code += char;
      i++;
      break;
    }

    code += char;
    i++;
  }

  return [{ code, imported, pathname }, i];
}

export function resolveCJSRequire(sourceCode, index) {
  let pathname = '';
  let code = '';

  let i = index;
  while (i < sourceCode.length) {
    const char = sourceCode[i];
    const nextChar = sourceCode[i + 1];

    if (isComment(char, nextChar)) {
      const [commentCode, nextIndex] = handleCommentCode(sourceCode, i);
      code += commentCode;
      i = nextIndex;
      continue;
    }

    if (isQuote(char)) {
      const [quotedCode, nextIndex] = handleQuotedCode(sourceCode, i);
      pathname = quotedCode.slice(1, -1);
      code += quotedCode;
      i = nextIndex;
      continue;
    }

    if (char === ')') {
      code += char;
      i++;
      break;
    }

    code += char;
    i++;
  }

  return [{ code, pathname }, i];
}

export function resovleCJSExports(sourceCode, index) {
  let varName = '';
  let nameFlag = false;
  let checking = false;
  let code = 'exports';

  let i = index + 'exports'.length;
  while (i < sourceCode.length) {
    const char = sourceCode[i];
    const nextChar = sourceCode[i + 1];

    if (isComment(char, nextChar)) {
      const [commentCode, nextIndex] = handleCommentCode(sourceCode, i);
      code += commentCode;
      i = nextIndex;
      continue;
    }

    if (checking) {
      code += char;
      i++;
      if (!isBlank(char) || char === '=') {
        if (char !== '=') {
          varName = '';
        }
        break;
      }
      continue;
    }

    if (nameFlag) {
      code += char;
      i++;
      if (isWord(char)) {
        varName += char;
      } else if (isBlank(char)) {
        if (varName) {
          nameFlag = false;
          checking = true;
        }
      } else {
        if (char !== '=') {
          varName = '';
        }
        break;
      }
      continue;
    }

    if (char === '.') {
      nameFlag = true;
      code += char;
      i++;
      continue;
    }

    if (!isBlank(char)) {
      code += char;
      i++;
      break;
    }

    code += char;
    i++;
  }

  return [{ code, varName }, i];
}

export function resolveEnvIf(sourceCode, index) {
  let conditionFlag = false;
  let condition = '';

  let thenStatementFlag = false;
  let thenStatement = '';

  let elseStatementFlag = false;
  let elseStatement = '';
  let penddingElseStatementFlag = false;

  const parentheseStack = [];
  const curlyStack = [];

  let i = index;
  while (i < sourceCode.length) {
    const char = sourceCode[i];
    const nextChar = sourceCode[i + 1];

    if (isComment(char, nextChar)) {
      const [commentCode, nextIndex] = handleCommentCode(sourceCode, i);
      if (conditionFlag) {
        condition += commentCode;
      } else if (thenStatementFlag) {
        thenStatement += commentCode;
      } else if (elseStatementFlag) {
        elseStatement += commentCode;
      }
      i = nextIndex;
      continue;
    }

    if (isQuote(char)) {
      const [quotedCode, nextIndex] = handleQuotedCode(sourceCode, i);
      if (conditionFlag) {
        condition += quotedCode;
      } else if (thenStatementFlag) {
        thenStatement += quotedCode;
      } else if (elseStatementFlag) {
        elseStatement += quotedCode;
      }
      i = nextIndex;
      continue;
    }

    if (conditionFlag) {
      if (char === '(') {
        parentheseStack.push(1);
      } else if (char === ')') {
        parentheseStack.pop();
        if (!parentheseStack.length) {
          conditionFlag = false;
          thenStatementFlag = true;
        }
      }
      condition += char;
      i++;
      continue;
    }

    if (thenStatementFlag) {
      if (char === '{') {
        curlyStack.push(1);
      } else if (char === '}') {
        curlyStack.pop();
        if (!curlyStack.length) {
          thenStatementFlag = false;
          penddingElseStatementFlag = true;
        }
      }
      thenStatement += char;
      i++;
      continue;
    }

    if (elseStatementFlag) {
      if (char === '{') {
        curlyStack.push(1);
      } else if (char === '}') {
        curlyStack.pop();
        if (!curlyStack.length) {
          elseStatement += char;
          elseStatementFlag = false;
          i++;
          break;
        }
      }
      elseStatement += char;
      i++;
      continue;
    }

    if (penddingElseStatementFlag) {
      if (isBlank(char)) {
        // blank
      } else if (isTheWord('else', sourceCode, i)) {
        penddingElseStatementFlag = false;
        elseStatementFlag = true;
        i += 4;
        continue;
      } else {
        penddingElseStatementFlag = false;
        break;
      }
    }

    if (char === '(') {
      conditionFlag = true;
      continue;
    }

    i++;
  }

  // eslint-disable-next-line no-eval
  let code = (0, eval)(condition) ? thenStatement : elseStatement;
  code = code.trim();

  return [code, i];
}

export function genCodeFromAST(ast) {
  let code = '';
  for (const node of ast) {
    if ('code' in node) {
      code += node.code;
    } else {
      code += node.rawCode;
    }
  }
  return code;
}

export function shouldResolveModule(pathname) {
  return ['.js', '.jsx', '.ts', '.tsx', '.vue', '.mjs', 'cjs'].includes(
    extname(pathname)
  );
}

const getPkgInfoCache = new Map();
export function getPkgInfo(pathname) {
  if (getPkgInfoCache.has(pathname)) {
    return getPkgInfoCache.get(pathname);
  }
  let _pathname = pathname;
  while (_pathname && _pathname !== '/') {
    const pkgjson = join(_pathname, 'package.json');
    if (existsSync(pkgjson)) {
      const pkgInfo = require(pkgjson);
      pkgInfo.__root__ = _pathname;
      getPkgInfoCache.set(pathname, pkgInfo);
      return pkgInfo;
    }
    _pathname = dirname(_pathname);
  }
}

export const GUESS_EXTENSIONS = [
  'js',
  'jsx',
  'ts',
  'tsx',
  'vue',
  'json',
  'mjs',
  'cjs',
];

const guessFileCache = new Map();
export function guessFile(pathname, extensions) {
  if (guessFileCache.has(pathname)) {
    return guessFileCache.get(pathname);
  }

  const ext = extname(pathname);

  if (!ext) {
    let _pathname = pathname;
    if (existsSync(pathname) && statSync(pathname).isDirectory()) {
      _pathname = join(pathname, 'index');
    }
    let filename = '';
    for (const ext of extensions || GUESS_EXTENSIONS) {
      filename = `${_pathname}.${ext}`;
      if (existsSync(filename)) {
        guessFileCache.set(pathname, filename);
        return filename;
      }
    }
    throw new Error(`File ${pathname} not found.`);
  }

  guessFileCache.set(pathname, pathname);

  return pathname;
}

export function log(...args) {
  // eslint-disable-next-line no-console
  console.log(...args);
}

export function extractEnv(envs) {
  const env = {};
  for (const e of envs) {
    env[e] = process.env[e];
  }
  return env;
}

export function ensurePathPrefix(pathname, prefix = './') {
  if (/^\.{0,2}\//g.test(pathname)) {
    return pathname;
  }
  return `${prefix}${pathname}`;
}

let aliasCache = null;
export function resolveAlias(alias, node) {
  if (!alias) {
    return;
  }

  let fullMathRE = null;
  let partMatchRE = null;
  if (aliasCache) {
    fullMathRE = aliasCache.fullMathRE;
    partMatchRE = aliasCache.partMatchRE;
  } else {
    const aliasKeys = Object.keys(alias);
    const fullMatchKeys = [];
    const partMatchKeys = [];
    for (const key of aliasKeys) {
      if (key.endsWith('$')) {
        fullMatchKeys.push(key.slice(0, -1));
      } else {
        partMatchKeys.push(key);
      }
    }
    aliasCache = {};
    aliasCache.fullMathRE = fullMathRE = fullMatchKeys.length
      ? new RegExp(`^${fullMatchKeys.join('|')}$`)
      : null;
    aliasCache.partMatchRE = partMatchRE = partMatchKeys.length
      ? new RegExp(`^${partMatchKeys.join('|')}`)
      : null;
  }

  let { pathname } = node;
  if (fullMathRE && fullMathRE.test(pathname)) {
    pathname = node.absPath = alias[pathname + '$'];
    node.setPathname(pathname);
  } else if (partMatchRE && partMatchRE.test(pathname)) {
    pathname = node.absPath = pathname.replace(partMatchRE, (m) => alias[m]);
    node.setPathname(pathname);
  }
}

export class Memfs {
  constructor() {
    this._files = {};
  }

  write(dest, content) {
    this._files[dest] = {
      content,
      size: Buffer.byteLength(content),
      mtime: new Date(),
    };
  }

  exists(dest) {
    return this._files[dest];
  }

  read(dest) {
    if (this.exists(dest)) {
      return this._files[dest].content;
    }
    return null;
  }

  stat(dest) {
    if (this.exists(dest)) {
      const res = { ...this._files[dest] };
      delete res.content;
      return res;
    }
    return null;
  }
}

export function openBrowser(url) {
  open(url);
}
