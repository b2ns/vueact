import { pauseTracking, reactive, resetTracking, toRaw } from '@vueact/reactivity';
import { EMPTY_OBJ, hasOwn } from '@vueact/shared';
import { h } from './vnode.js';

let uid = 0;

/*
 * component
 */
export function createComponentInstance(vnode, parent) {
  const { type } = vnode;
  const appContext = parent ? parent.appContext : vnode.appContext;
  const instance = {
    uid: uid++,
    vnode,
    type,
    parent,
    appContext,
    root: null,
    next: null,
    subTree: null,
    effect: null,
    update: null,
    render: null,

    provides: parent ? parent.provides : Object.create(appContext.provides),

    props: EMPTY_OBJ,
    refs: EMPTY_OBJ,
    setupContext: null,

    isMounted: false,
    isUnmounted: false,
    isDeactivated: false,
    bc: null,
    c: null,
    bm: null,
    m: null,
    bu: null,
    u: null,
    um: null,
    bum: null,
    da: null,
    a: null,
  };

  instance.root = parent ? parent.root : instance;

  return instance;
}

export let currentInstance = null;
export const getCurrentInstance = () => {
  return currentInstance;
};
export const setCurrentInstance = (instance = null) => {
  currentInstance = instance;
};

export function setupComponent(instance) {
  const { type: Component, props = {}, children } = instance.vnode;
  initProps(instance, { ...props, children });

  const setupContext = (instance.setupContext = {});

  setCurrentInstance(instance);
  pauseTracking();
  instance.render = Component(instance.props, setupContext);
  resetTracking();
  setCurrentInstance();
}

export function renderComponentRoot(instance) {
  return instance.render(h);
}

/*
 * component props
 */
export function shouldUpdateComponent(prevVNode, nextVNode) {
  const { props: prevProps, children: prevChildren } = prevVNode;
  const { props: nextProps, children: nextChildren } = nextVNode;

  if (prevChildren || nextChildren) {
    return true;
  }
  if (prevProps === nextProps) {
    return false;
  }
  if (!prevProps) {
    return !!nextProps;
  }
  if (!nextProps) {
    return true;
  }

  const nextKeys = Object.keys(nextProps);
  if (nextKeys.length !== Object.keys(prevProps).length) {
    return true;
  }

  for (let i = 0; i < nextKeys.length; i++) {
    const key = nextKeys[i];
    if (nextProps[key] !== prevProps[key]) {
      return true;
    }
  }

  return false;
}

export function initProps(instance, rawProps) {
  const props = {};
  setFullProps(rawProps, props);
  instance.props = reactive(props);
}

export function updateProps(instance, rawProps) {
  const { props } = instance;
  const rawCurrentProps = toRaw(props);
  setFullProps(rawProps, props);
  for (const key in rawCurrentProps) {
    if (Object.hasOwnProperty.call(rawCurrentProps, key)) {
      if (!rawProps || !hasOwn(rawProps, key)) {
        delete props[key];
      }
    }
  }
}

export function setFullProps(rawProps, props) {
  if (rawProps) {
    for (const key in rawProps) {
      if (Object.hasOwnProperty.call(rawProps, key)) {
        const value = rawProps[key];
        props[key] = value;
      }
    }
  }
}

export const LifecycleHooks = {
  BEFORE_CREATE: 'bc',
  CREATED: 'c',
  BEFORE_MOUNT: 'bm',
  MOUNTED: 'm',
  BEFORE_UPDATE: 'bu',
  UPDATED: 'u',
  BEFORE_UNMOUNT: 'bum',
  UNMOUNTED: 'um',
  DEACTIVATED: 'da',
  ACTIVATED: 'a',
};

/*
 * component lifecycles
 */
function injectHook(type, hook, target) {
  if (target) {
    const hooks = target[type] || (target[type] = []);
    const wrappedHook = (...args) => {
      if (target.isUnmounted) {
        return;
      }
      setCurrentInstance(target);
      pauseTracking();
      const res = hook(...args);
      resetTracking();
      setCurrentInstance();
      return res;
    };
    hooks.push(wrappedHook);
    return wrappedHook;
  }
}

const createHook =
  (lifecycle) =>
  (hook, target = currentInstance) =>
    injectHook(lifecycle, hook, target);

export const onBeforeMount = createHook(LifecycleHooks.BEFORE_MOUNT);
export const onMounted = createHook(LifecycleHooks.MOUNTED);
export const onBeforeUpdate = createHook(LifecycleHooks.BEFORE_UPDATE);
export const onUpdated = createHook(LifecycleHooks.UPDATED);
export const onBeforeUnmount = createHook(LifecycleHooks.BEFORE_UNMOUNT);
export const onUnmounted = createHook(LifecycleHooks.UNMOUNTED);
