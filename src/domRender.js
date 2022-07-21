import { createRenderer } from './renderer.js';
import { isArray, isOn, isString } from './utils.js';

export const render = createRenderer({
  insert: (child, parent, anchor) => parent.insertBefore(child, anchor || null),

  remove: (child) => {
    const parent = child.parentNode;
    if (parent) {
      parent.removeChild(child);
    }
  },

  patchProp,

  createElement: (tag) => document.createElement(tag),

  createText: (text) => document.createTextNode(text),

  createComment: (text) => document.createComment(text),

  setText: (node, text) => (node.nodeValue = text),

  setElementText: (el, text) => (el.textContent = text),

  parentNode: (node) => node.parentNode,

  nextSibling: (node) => node.nextSibling,

  querySelector: (selector) => document.querySelector(selector),

  setScopeId(el, id) {
    el.setAttribute(id, '');
  },

  cloneNode: (el) => el.cloneNode(true),
});

const nativeOnRE = /^on[a-z]/;

function patchProp(el, key, prevValue, nextValue, prevChildren, parentComponent, unmountChildren) {
  if (key === 'class') {
    patchClass(el, nextValue);
  } else if (key === 'style') {
    patchStyle(el, prevValue, nextValue);
  } else if (isOn(key)) {
    patchEvent(el, key, prevValue, nextValue, parentComponent);
  } else if (shouldSetAsProp(el, key, nextValue)) {
    patchDOMProp(el, key, nextValue, prevChildren, parentComponent, unmountChildren);
  } else {
    patchAttr(el, key, nextValue, parentComponent);
  }
}

function shouldSetAsProp(el, key, value) {
  if (key === 'spellcheck' || key === 'draggable' || key === 'translate') {
    return false;
  }

  if (key === 'form') {
    return false;
  }

  if (key === 'list' && el.tagName === 'INPUT') {
    return false;
  }

  if (key === 'type' && el.tagName === 'TEXTAREA') {
    return false;
  }

  if (nativeOnRE.test(key) && isString(value)) {
    return false;
  }

  return key in el;
}

function patchClass(el, value) {
  if (value == null) {
    el.removeAttribute('class');
  } else {
    el.className = value;
  }
}
export function patchStyle(el, prev, next) {
  const style = el.style;
  const isCssString = isString(next);
  if (next && !isCssString) {
    for (const key in next) {
      setStyle(style, key, next[key]);
    }
    if (prev && !isString(prev)) {
      for (const key in prev) {
        if (next[key] == null) {
          setStyle(style, key, '');
        }
      }
    }
  } else {
    if (isCssString) {
      if (prev !== next) {
        style.cssText = next;
      }
    } else if (prev) {
      el.removeAttribute('style');
    }
  }
}
function setStyle(style, name, val) {
  if (isArray(val)) {
    val.forEach((v) => setStyle(style, name, v));
  } else {
    if (val == null) val = '';
    if (name.startsWith('--')) {
      style.setProperty(name, val);
    } else {
      style[name] = val;
    }
  }
}

export function patchAttr(el, key, value) {
  if (value == null) {
    el.removeAttribute(key);
  } else {
    el.setAttribute(key, value);
  }
}

export function patchDOMProp(el, key, value, prevChildren, parentComponent, unmountChildren) {
  if (key === 'innerHTML' || key === 'textContent') {
    if (prevChildren) {
      unmountChildren(prevChildren, parentComponent);
    }
    el[key] = value == null ? '' : value;
    return;
  }

  el[key] = value;
}

export function patchEvent(el, rawName, prevValue, nextValue) {
  const name = rawName.slice(2).toLowerCase();
  // vei = vue event invokers
  const invokers = el._vei || (el._vei = {});
  const existingInvoker = invokers[name];
  if (nextValue && existingInvoker) {
    existingInvoker.value = nextValue;
  } else {
    if (nextValue) {
      const invoker = (invokers[name] = createInvoker(nextValue));
      el.addEventListener(name, invoker);
    } else if (existingInvoker) {
      el.removeEventListener(name, existingInvoker);
      invokers[name] = undefined;
    }
  }
}

function createInvoker(initialValue) {
  const invoker = (e) => {
    invoker.value(e);
  };
  invoker.value = initialValue;
  return invoker;
}
