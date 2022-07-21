const toStringType = (val) => Object.prototype.toString.call(val).slice(8, -1);
export const type = (val) => {
  const strType = toStringType(val);
  if (strType === 'Object' && val && val.constructor) {
    return val.constructor.name;
  }
  return strType;
};
export const isString = (val) => typeof val === 'string';
export const isBoolean = (val) => typeof val === 'boolean';
export const isObject = (val) => val !== null && typeof val === 'object';
export const isPlainObject = (val) => type(val) === 'Object';
export const isArray = (val) => Array.isArray(val);
export const isFunction = (val) => typeof val === 'function';
export const hasChanged = (value, oldValue) => !Object.is(value, oldValue);
export const hasOwn = (val, key) => Object.prototype.hasOwnProperty.call(val, key);
export const NOOP = () => {};
export const EMPTY_OBJ = {};
const onRE = /^on[^a-z]/;
export const isOn = (key) => onRE.test(key);
export const toDisplayString = (val) => {
  return isString(val)
    ? val
    : val == null || isBoolean(val)
    ? ''
    : isArray(val) || isPlainObject(val)
    ? JSON.stringify(val, 2)
    : String(val);
};
export const invokeArrayFns = (fns, ...arg) => {
  for (let i = 0; i < fns.length; i++) {
    fns[i](...arg);
  }
};
