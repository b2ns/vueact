import {
  isArray,
  isObject,
  isString,
  isFunction,
  toDisplayString,
} from '@vueact/shared';
import { isProxy } from '@vueact/reactivity';

export const ShapeFlags = {
  ELEMENT: 1,
  FUNCTIONAL_COMPONENT: 1 << 1,
  STATEFUL_COMPONENT: 1 << 2,
  TEXT_CHILDREN: 1 << 3,
  ARRAY_CHILDREN: 1 << 4,
  SLOTS_CHILDREN: 1 << 5,
  COMPONENT_SHOULD_KEEP_ALIVE: 1 << 8,
  COMPONENT_KEPT_ALIVE: 1 << 9,
};
ShapeFlags.COMPONENT =
  ShapeFlags.STATEFUL_COMPONENT | ShapeFlags.FUNCTIONAL_COMPONENT;

export const Text = Symbol('text vnode');

export function h(type, props, children) {
  if (isVNode(children)) {
    children = [children];
  } else if (isArray(children)) {
    children = children.flat(1);
    children = children.map((child) =>
      isVNode(child) || isFunction(child)
        ? child
        : createTextVNode(toDisplayString(child))
    );
  } else if (children) {
    if (!isFunction(children)) {
      children = toDisplayString(children);
    }
  }
  return createVNode(type, props, children);
}

export function createVNode(type, props, children) {
  if (props) {
    props = Object.assign({}, props);
    let { class: klass, style } = props;
    if (klass && !isString(klass)) {
      props.class = normalizeClass(klass);
    }
    if (isObject(style)) {
      if (isProxy(style) && !isArray(style)) {
        style = Object.assign({}, style);
      }
      props.style = normalizeStyle(style);
    }
  }

  const shapeFlag = isString(type)
    ? ShapeFlags.ELEMENT
    : // : isObject(type)
    // ? ShapeFlags.STATEFUL_COMPONENT
    isFunction(type)
    ? ShapeFlags.STATEFUL_COMPONENT
    : // ? ShapeFlags.FUNCTIONAL_COMPONENT
      0;

  return createBaseVNode(type, props, children, shapeFlag);
}

export function createTextVNode(text) {
  return createVNode(Text, null, text);
}

export function isVNode(value) {
  return value ? value.__v_isVNode === true : false;
}

export function isSameVNodeType(n1, n2) {
  return n1.type === n2.type && n1.key === n2.key;
}

function createBaseVNode(
  type,
  props = null,
  children = null,
  shapeFlag = ShapeFlags.ELEMENT
) {
  const vnode = {
    __v_isVNode: true,
    __v_skip: true,
    type,
    props,
    key: props?.key ?? null,
    slotScopeIds: null,
    children,
    component: null,
    el: null,
    anchor: null,
    target: null,
    targetAnchor: null,
    staticCount: 0,
    shapeFlag,
    appContext: null,
  };

  if (children) {
    vnode.shapeFlag |= isString(children)
      ? ShapeFlags.TEXT_CHILDREN
      : ShapeFlags.ARRAY_CHILDREN;
  }

  return vnode;
}

function normalizeClass(value) {
  let res = '';
  if (isString(value)) {
    res = value;
  } else if (isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const normalized = normalizeClass(value[i]);
      if (normalized) {
        res += normalized + ' ';
      }
    }
  } else if (isObject(value)) {
    for (const name in value) {
      if (value[name]) {
        res += name + ' ';
      }
    }
  }
  return res.trim();
}

function normalizeStyle(value) {
  if (isString(value)) {
    return value;
  } else if (isObject(value)) {
    return value;
  }
}
