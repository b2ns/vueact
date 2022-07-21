export const CommentTypes = {
  ONE_LINE: '/',
  MULTI_LINE: '*',
};

export const QuoteTypes = {
  SINGLE: `'`,
  DOUBLE: `"`,
  BACK: '`',
};

export function skipCommentCode(sourceCode, index) {
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

export const isComment = (char, nextChar) => char === '/' && (nextChar === CommentTypes.ONE_LINE || nextChar === CommentTypes.MULTI_LINE);

export const isQuote = (char) => char === QuoteTypes.SINGLE || char === QuoteTypes.DOUBLE || char === QuoteTypes.BACK;

export const isNewLine = (char) => /[\n\r]/.test(char);

export const debounce = (fn, wait = 300) => {
  let timer = 0;
  return function (...args) {
    timer && clearTimeout(timer);
    timer = setTimeout(() => {
      fn(...args);
    }, wait);
  };
};

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
