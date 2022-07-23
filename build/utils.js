import { existsSync, readdirSync, statSync, watch } from 'fs';
import { extname, isAbsolute, join } from 'path';

export const CommentTypes = {
  ONE_LINE: '/',
  MULTI_LINE: '*',
};

export const QuoteTypes = {
  SINGLE: `'`,
  DOUBLE: `"`,
  BACK: '`',
};

export const isComment = (char, nextChar) => char === '/' && (nextChar === CommentTypes.ONE_LINE || nextChar === CommentTypes.MULTI_LINE);

export const isQuote = (char) => char === QuoteTypes.SINGLE || char === QuoteTypes.DOUBLE || char === QuoteTypes.BACK;

export const isNewLine = (char) => /[\n\r]/.test(char);

export function isImport(code, index) {
  return (
    index + 5 < code.length &&
    code[index] === 'i' &&
    code[index + 1] === 'm' &&
    code[index + 2] === 'p' &&
    code[index + 3] === 'o' &&
    code[index + 4] === 'r' &&
    code[index + 5] === 't'
  );
}

export const isRelative = (pathname) => pathname.startsWith('./') || pathname.startsWith('..');

export const isNodeBuiltin = (pathname) =>
  [
    'assert',
    'async_hooks',
    'buffer',
    'child_process',
    'cluster',
    'console',
    'constants',
    'crypto',
    'dgram',
    'diagnostics_channel',
    'dns',
    'domain',
    'events',
    'fs',
    'http',
    'http2',
    'https',
    'inspector',
    'module',
    'net',
    'os',
    'path',
    'perf_hooks',
    'process',
    'punycode',
    'querystring',
    'readline',
    'repl',
    'stream',
    'string_decoder',
    'timers',
    'tls',
    'trace_events',
    'tty',
    'url',
    'util',
    'v8',
    'vm',
    'wasi',
    'worker_threads',
    'zlib',
  ].includes(pathname);

// for browser there is no need to check node builtin module
export const isNpmModule = (pathname) => !isAbsolute(pathname) && !isRelative(pathname);

export function escape(str, chars) {
  if (!chars) {
    return str;
  }

  let res = '';
  for (const ch of str) {
    if (chars.includes(ch)) {
      res += '\\';
    }
    res += ch;
  }
  return res;
}

export function parseArgs(args) {
  const res = { files: [] };
  for (const arg of args) {
    const segments = arg.split('=');
    if (segments.length === 2) {
      res[segments[0].replace(/^-*/, '')] = segments[1];
    } else if (arg.startsWith('-')) {
      res[arg.replace(/^-*/, '')] = true;
    } else {
      res.files.push(arg);
    }
  }
  return res;
}

export const debounce = (fn, wait = 300) => {
  let timer = 0;
  return function (...args) {
    timer && clearTimeout(timer);
    timer = setTimeout(() => {
      fn(...args);
    }, wait);
  };
};

export function handleCommentCode(sourceCode, index) {
  let code = '';
  const commentType = sourceCode[index + 1] === CommentTypes.MULTI_LINE ? CommentTypes.MULTI_LINE : CommentTypes.ONE_LINE;

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
  const { alias } = resolveOpts;
  const ast = [];
  let code = '';

  function stageOtherCode() {
    if (code) {
      ast.push({
        type: 'other',
        rawCode: code,
      });
      code = '';
    }
  }

  let i = 0;
  while (i < sourceCode.length) {
    const char = sourceCode[i];
    const nextChar = sourceCode[i + 1];

    if (isComment(char, nextChar)) {
      stageOtherCode();
      const [commentCode, nextIndex] = handleCommentCode(sourceCode, i);
      ast.push({
        type: 'comment',
        code: commentCode,
      });
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
      stageOtherCode();
      const [{ code: rawCode, pathname }, nextIndex] = getImportStatement(sourceCode, i);
      ast.push({
        type: 'import',
        rawCode,
        rawPathname: pathname,
        code: rawCode,
        pathname,
        absPath: pathname,
      });
      i = nextIndex;
      continue;
    }

    code += char;
    i++;
  }
  stageOtherCode();

  let aliasKeys = '';
  if (alias && (aliasKeys = Object.keys(alias).join('|'))) {
    const aliasRE = new RegExp(`^${aliasKeys}`);
    for (const node of ast) {
      if (node.type !== 'import') {
        continue;
      }
      if (aliasRE.test(node.pathname)) {
        node.absPath = node.pathname = node.pathname.replace(aliasRE, (m) => alias[m]);
        node.code = node.code.replace(node.rawPathname, node.pathname);
      }
    }
  }

  return ast;
}

export function getImportStatement(sourceCode, index) {
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
  return ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.vue'].includes(extname(pathname));
}

export const GUESS_EXTENSIONS = ['js', 'jsx', 'json', 'ts', 'tsx', 'vue', 'mjs'];
export function normalizePathname(pathname, extensions) {
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

export function recursiveWatch(dir, handler) {
  watch(dir, (event, filename) => handler(event, join(dir, filename)));
  const dirs = readdirSync(dir);
  for (let file of dirs) {
    file = join(dir, file);
    if (statSync(file).isDirectory()) {
      recursiveWatch(file, handler);
    }
  }
}

export function log(...args) {
  // eslint-disable-next-line no-console
  console.log(...args);
}

export function removeItem(arr, item) {
  const index = arr.indexOf(item);
  if (index >= 0) {
    arr.splice(index, 1);
  }
}

export function ensureArray(val) {
  if (Array.isArray(val)) {
    return val;
  }
  return val == null ? val : [val];
}
