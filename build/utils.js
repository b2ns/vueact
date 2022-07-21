export const CommentTypes = {
  ONE_LINE: 1,
  MULTI_LINE: 2,
};

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
