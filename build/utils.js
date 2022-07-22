import { existsSync, readFileSync } from 'fs';
import { extname, isAbsolute } from 'path';

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

// TODO: ignore node builtin lib
export const inNodeModules = (pathname) => !isAbsolute(pathname) && !isRelative(pathname);

export function escape(str, chars) {
  if (!chars) {
    return str;
  }

  if (!Array.isArray(chars)) {
    chars = [chars];
  } else if (!chars.length) {
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
    if (segments.length == 2) {
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

export function resolveImportModules(sourceCode, resolveOpts = {}) {
  const { alias } = resolveOpts;
  const importModules = new Set();

  let i = 0;
  while (i < sourceCode.length) {
    const char = sourceCode[i];
    const nextChar = sourceCode[i + 1];

    if (isComment(char, nextChar)) {
      const [_, nextIndex] = handleCommentCode(sourceCode, i);
      i = nextIndex;
      continue;
    }

    if (isQuote(char)) {
      const [_, nextIndex] = handleQuotedCode(sourceCode, i);
      i = nextIndex;
      continue;
    }

    if (isImport(sourceCode, i)) {
      const [moduleName, nextIndex] = getModuleName(sourceCode, i);
      importModules.add(moduleName);
      i = nextIndex;
      continue;
    }

    i++;
  }

  let modules = [...importModules];

  let aliasKeys = '';
  if (alias && (aliasKeys = Object.keys(alias).join('|'))) {
    const aliasRE = new RegExp(`^${aliasKeys}`);
    const tmpSet = new Set();
    for (const module of modules) {
      if (aliasRE.test(module)) {
        tmpSet.add(module.replace(aliasRE, (m) => alias[m]));
      } else {
        tmpSet.add(module);
      }
    }
    modules = [...tmpSet];
  }

  return modules;
}

export function getModuleName(sourceCode, index) {
  let moduleName = '';

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
      moduleName = quotedCode.slice(1, -1);
      i = nextIndex;
      break;
    }

    i++;
  }

  return [moduleName, i];
}

const EXTENSIONS = ['js', 'jsx', 'json', 'ts', 'tsx', 'vue', 'mjs'];
export function normalizePathname(pathname, extensions) {
  const ext = extname(pathname);

  if (!ext) {
    for (const ext of extensions || EXTENSIONS) {
      if (existsSync(`${pathname}.${ext}`)) {
        pathname = `${pathname}.${ext}`;
        return pathname;
      }
    }
    throw new Error(`File ${pathname} not found.`);
  }

  return pathname;
}
