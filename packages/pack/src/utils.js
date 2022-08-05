import { isBuiltin } from '@vueact/shared/src/node-utils.js';
import { existsSync, statSync } from 'fs';
import { createRequire } from 'module';
import { dirname, extname, isAbsolute, join } from 'path';
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

let aliasCache = null;
export function resolveModuleImport(sourceCode, resolveOpts = {}) {
  let _isImport = false;
  const { alias } = resolveOpts;
  const ast = [];
  let code = '';
  const require2Imports = [];
  const moduleExportNames = [];

  function stageOtherCode() {
    if (code) {
      ast.push(createASTNode('other', code));
      code = '';
    }
  }

  let isESM = false;

  let i = 0;
  while (i < sourceCode.length) {
    const char = sourceCode[i];
    const nextChar = sourceCode[i + 1];

    if (isComment(char, nextChar)) {
      stageOtherCode();
      const [commentCode, nextIndex] = handleCommentCode(sourceCode, i);
      ast.push(createASTNode('comment', commentCode));
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
      isESM = true;
      stageOtherCode();
      const [{ code: rawCode, pathname }, nextIndex] = resolveESImport(
        sourceCode,
        i,
        _isImport ? 'import' : 'export'
      );

      ast.push(
        createASTNode('import', rawCode, { pathname, reExport: !_isImport })
      );

      i = nextIndex;
      continue;
    }

    if (!isESM && isExport(sourceCode, i)) {
      isESM = true;
    }

    if (isRequire(sourceCode, i)) {
      stageOtherCode();
      const [{ code: rawCode, pathname }, nextIndex] = resolveCJSRequire(
        sourceCode,
        i
      );
      let varName = rawCode;

      if (!require2Imports[pathname]) {
        if (!isBuiltin(pathname)) {
          varName = `__pack_require2esm_${pathname.replace(/\W/g, '_')}__`;
          require2Imports.push(
            createASTNode('import', `import ${varName} from '${pathname}';\n`, {
              pathname,
            })
          );
        }
        require2Imports[pathname] = true;
      }

      ast.push(createASTNode('other', varName));

      i = nextIndex;
      continue;
    }

    if (!isESM && isExports(sourceCode, i)) {
      stageOtherCode();
      const [{ code: rawCode, varName }, nextIndex] = resovleCJSExports(
        sourceCode,
        i
      );

      if (varName && !moduleExportNames[varName]) {
        moduleExportNames.push(varName);
        moduleExportNames[varName] = true;
      }

      ast.push(createASTNode('other', rawCode));

      i = nextIndex;
      continue;
    }

    code += char;
    i++;
  }
  stageOtherCode();

  if (require2Imports.length) {
    ast.unshift(...require2Imports);
  }

  if (moduleExportNames.length) {
    let exportCode = '';
    for (const varName of moduleExportNames) {
      exportCode += `export const ${varName} = module.exports.${varName};\n`;
    }
    ast.push(createASTNode('other', exportCode));
  }

  let aliasKeys = null;
  if (aliasCache || (alias && (aliasKeys = Object.keys(alias)))) {
    let fullMathRE = null;
    let partMatchRE = null;
    if (aliasCache) {
      fullMathRE = aliasCache.fullMathRE;
      partMatchRE = aliasCache.partMatchRE;
    } else {
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

    for (const node of ast) {
      if (node.type !== 'import') {
        continue;
      }
      let { pathname } = node;
      if (fullMathRE && fullMathRE.test(pathname)) {
        pathname = node.absPath = alias[pathname + '$'];
        node.setPathname(pathname);
      } else if (partMatchRE && partMatchRE.test(pathname)) {
        pathname = node.absPath = pathname.replace(
          partMatchRE,
          (m) => alias[m]
        );
        node.setPathname(pathname);
      }
    }
  }

  // inject helper to load umd or commonjs code
  if (!isESM) {
    const head = createASTNode(
      'other',
      `const module = { exports: {} };
const exports = module.exports;
const require = () => {};
`
    );
    const tail = createASTNode('other', `export default module.exports;`);

    ast.unshift(head);
    ast.push(tail);
  }

  return ast;
}

export function createASTNode(type, rawCode, extra = {}) {
  const node = {
    type,
    rawCode,
  };
  if (type === 'import') {
    const { pathname } = extra;
    Object.assign(node, {
      rawPathname: pathname,
      reExport: false,
      code: rawCode,
      pathname,
      absPath: pathname,
      setPathname(pathname) {
        node.code = node.code.replace(
          new RegExp(`(?<='|")${node.pathname}(?='|")`),
          pathname
        );
        node.pathname = pathname;
      },
    });
  }
  return node;
}

export function resolveESImport(sourceCode, index, keyword) {
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

export function getPkgInfo(pathname) {
  while (pathname && pathname !== '/') {
    const pkgjson = join(pathname, 'package.json');
    if (existsSync(pkgjson)) {
      const pkgInfo = require(pkgjson);
      pkgInfo.__root__ = pathname;
      return pkgInfo;
    }
    pathname = dirname(pathname);
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
export function guessFile(pathname, extensions) {
  const ext = extname(pathname);

  if (!ext) {
    if (existsSync(pathname) && statSync(pathname).isDirectory()) {
      pathname = join(pathname, 'index');
    }
    let _pathname = '';
    for (const ext of extensions || GUESS_EXTENSIONS) {
      _pathname = `${pathname}.${ext}`;
      if (existsSync(_pathname)) {
        return _pathname;
      }
    }
    throw new Error(`File ${pathname} not found.`);
  }

  return pathname;
}

export function normalizeExtension(
  node,
  { defaultExtension = '.js', target = 'default' } = {}
) {
  let { pathname } = node;
  const ext = extname(pathname);
  const extensions = ['.jsx', '.ts', '.tsx'];
  if (target === 'default') {
    extensions.push(...['.mjs', '.cjs']);
  }

  if (!ext) {
    pathname = `${pathname}${
      defaultExtension.startsWith('.')
        ? defaultExtension
        : '.' + defaultExtension
    }`;
  } else if (extensions.includes(ext)) {
    pathname = pathname.replace(ext, defaultExtension);
  } else {
    return;
  }
  node.setPathname(pathname);
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

export function ensurePathPrefix(pathname) {
  if (/^\.{0,2}\//g.test(pathname)) {
    return pathname;
  }
  return `./${pathname}`;
}
