const toStringType = (val) => Object.prototype.toString.call(val).slice(8, -1);
export const type = (val) => {
  const strType = toStringType(val);
  if (strType === 'Object' && val && val.constructor) {
    return val.constructor.name;
  }
  return strType;
};

export const isNumber = (val) => typeof val === 'number';

export const isString = (val) => typeof val === 'string';

export const isBoolean = (val) => typeof val === 'boolean';

export const isUndef = (val) => typeof val === 'undefined';

export const isDef = (val) => !isUndef(val);

export const isSymbol = (val) => typeof val === 'symbol';

export const isBigint = (val) => typeof val === 'bigint';

export const isObject = (val) => val !== null && typeof val === 'object';

export const isPlainObject = (val) => type(val) === 'Object';

export const isArray = (val) => Array.isArray(val);

export const isFunction = (val) => typeof val === 'function';

export const isSet = (val) => type(val) === 'Set';

export const isMap = (val) => type(val) === 'Map';

export const hasChanged = (value, oldValue) => !Object.is(value, oldValue);

export const hasOwn = (val, key) =>
  Object.prototype.hasOwnProperty.call(val, key);

export const isIntegerKey = (key) => /^\d+$/.test(key);

export const NOOP = () => {};

export const EMPTY_OBJ = {};

export const EMPTY_ARR = [];

const onRE = /^on[^a-z]/;

export const isOn = (key) => onRE.test(key);

export const toDisplayString = (val) =>
  isString(val)
    ? val
    : val == null || isBoolean(val)
    ? ''
    : isArray(val) || isPlainObject(val)
    ? JSON.stringify(val, 2)
    : String(val);

export const invokeArrayFns = (fns, ...arg) => {
  for (let i = 0; i < fns.length; i++) {
    fns[i](...arg);
  }
};

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

export const debounce = (fn, wait = 300) => {
  let timer = 0;
  return function (...args) {
    timer && clearTimeout(timer);
    timer = setTimeout(() => {
      fn(...args);
    }, wait);
  };
};

export function removeItem(arr, item, replaceItem) {
  const index = arr.indexOf(item);
  if (index >= 0) {
    replaceItem ? arr.splice(index, 1, replaceItem) : arr.splice(index, 1);
  }
}

export function ensureArray(val) {
  if (Array.isArray(val)) {
    return val;
  }
  return val == null ? val : [val];
}

export function getGlobalThis() {
  return typeof globalThis !== 'undefined'
    ? globalThis
    : typeof self !== 'undefined'
    ? self
    : typeof window !== 'undefined'
    ? window
    : typeof global !== 'undefined'
    ? global
    : {};
}
