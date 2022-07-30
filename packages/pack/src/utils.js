import { isBuiltin, isRelative } from '@vueact/shared/src/node-utils.js';
import { existsSync } from 'fs';
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

export const isNewLine = (char) => /[\n\r]/.test(char);

export function isImport(code, index) {
  if (isTheWord('import', code, index)) {
    return true;
  }

  if (isExport(code, index)) {
    let inCurly = false;
    let i = index + 6;
    while (i < code.length) {
      const char = code[i];
      const nextChar = code[i + 1];
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
      if (
        (char === 'a' && nextChar === 's') ||
        (char === 'f' &&
          nextChar === 'r' &&
          code[i + 2] === 'o' &&
          code[i + 3] === 'm')
      ) {
        return true;
      }
      if (!/[*\s]/.test(char)) {
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
      if (!/\s/.test(char)) {
        return false;
      }
      i++;
    }
  }
  return false;
}

export function isTheWord(word, code, index) {
  let res = !/\w/.test(code[index - 1] || '');
  if (!res) return res;
  let i = 0;
  for (; i < word.length; i++) {
    const char = word[i];
    res = res && char === code[index + i];
    if (!res) return res;
  }
  res = res && !/\w/.test(code[index + i]);
  return res;
}

export const isPkg = (pathname) =>
  !isAbsolute(pathname) && !isRelative(pathname) && !isBuiltin(pathname);

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

export function resolveModuleImport(sourceCode, resolveOpts = {}) {
  const { alias, imports } = resolveOpts;
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

    if (isImport(sourceCode, i)) {
      isESM = true;
      stageOtherCode();
      const [{ code: rawCode, pathname }, nextIndex] = getImportPathname(
        sourceCode,
        i
      );

      ast.push(createASTNode('import', rawCode, { pathname }));

      i = nextIndex;
      continue;
    }

    if (!isESM && isExport(sourceCode, i)) {
      isESM = true;
    }

    if (isRequire(sourceCode, i)) {
      stageOtherCode();
      const [{ code: varName, pathname }, nextIndex] = resolveCJSRequire(
        sourceCode,
        i
      );

      if (!require2Imports[pathname]) {
        require2Imports.push(
          createASTNode('import', `import ${varName} from '${pathname}';\n`, {
            pathname,
          })
        );
        require2Imports[pathname] = true;
      }

      ast.push(createASTNode('other', varName));

      i = nextIndex;
      continue;
    }

    if (isExports(sourceCode, i)) {
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

  let aliasKeys = '';
  if (alias && (aliasKeys = Object.keys(alias).join('|'))) {
    const aliasRE = new RegExp(`^${aliasKeys}`);
    for (const node of ast) {
      if (node.type !== 'import') {
        continue;
      }
      let { pathname } = node;
      if (aliasRE.test(pathname)) {
        pathname = node.absPath = pathname.replace(aliasRE, (m) => alias[m]);
        node.setPathname(pathname);
      }
    }
  }

  if (imports && Object.keys(imports).length) {
    for (const node of ast) {
      if (node.type !== 'import') {
        continue;
      }
      let { pathname } = node;
      const newPathname = imports[pathname];
      if (newPathname) {
        pathname = node.absPath = newPathname;
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

export function getImportPathname(sourceCode, index) {
  let code = '';
  let pathname = '';

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

    if (pathname && (char === ';' || isNewLine(char))) {
      code += char;
      i++;
      break;
    }

    code += char;
    i++;
  }

  return [{ code, pathname }, i];
}

export function resolveCJSRequire(sourceCode, index) {
  let pathname = '';

  let i = index;
  while (i < sourceCode.length) {
    const char = sourceCode[i];
    const nextChar = sourceCode[i + 1];

    if (isComment(char, nextChar)) {
      const [_, nextIndex] = handleCommentCode(sourceCode, i);
      i = nextIndex;
      continue;
    }

    if (isQuote(char)) {
      const [quotedCode, nextIndex] = handleQuotedCode(sourceCode, i);
      pathname = quotedCode.slice(1, -1);
      i = nextIndex;
      continue;
    }

    if (char === ')') {
      i++;
      break;
    }

    i++;
  }

  const code = `__pack_require2esm_${pathname.replace(/\W/g, '_')}__`;

  return [{ code, pathname }, i];
}

export function resovleCJSExports(sourceCode, index) {
  let varName = '';
  let nameFlag = false;
  let checking = false;
  let code = '';

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
      if (!/\s/.test(char) || char === '=') {
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
      if (/\w/.test(char)) {
        varName += char;
      } else if (/\s/.test(char)) {
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

    if (!/\s/.test(char)) {
      code += char;
      i++;
      break;
    }

    code += char;
    i++;
  }

  code = 'exports' + code;

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
  return ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.vue'].includes(
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
  'json',
  'ts',
  'tsx',
  'vue',
  'mjs',
];
export function guessExtension(pathname, extensions) {
  const ext = extname(pathname);

  if (!ext) {
    for (const ext of extensions || GUESS_EXTENSIONS) {
      if (existsSync(`${pathname}.${ext}`)) {
        pathname = `${pathname}.${ext}`;
        return pathname;
      }
    }
    throw new Error(`File ${pathname} not found.`);
  }

  return pathname;
}

export function normalizeExtension(node, defaultExtension = '.js') {
  let { pathname } = node;
  const ext = extname(pathname);
  if (!ext) {
    pathname = `${pathname}${defaultExtension}`;
  } else if (['.jsx', '.ts', '.tsx', '.mjs'].includes(ext)) {
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
