import {
  hasChanged,
  hasOwn,
  isArray,
  isFunction,
  isIntegerKey,
  isObject,
} from '@vueact/shared';
import { queuePostFlushCb, queuePreFlushCb } from './scheduler.js';

/*
 * reactive
 */
export const ReactiveFlags = {
  IS_REACTIVE: '__v_isReactive',
  RAW: '__v_raw',
};
export const TrackTypes = {
  GET: 'get',
  HAS: 'has',
  ITERATE: 'iterate',
};
export const TriggerTypes = {
  SET: 'set',
  ADD: 'add',
  DELETE: 'delete',
};

export const ITERATE_KEY = Symbol();

const reactiveMap = new WeakMap();

export function reactive(target) {
  return createReactiveObject(target, createHandlers(), reactiveMap);
}

export function createReactiveObject(target, handlers, proxyMap) {
  if (!isObject(target)) {
    return target;
  }

  if (target[ReactiveFlags.RAW]) {
    return target;
  }

  const existingProxy = proxyMap.get(target);
  if (existingProxy) {
    return existingProxy;
  }

  const proxy = new Proxy(target, handlers);

  proxyMap.set(target, proxy);

  return proxy;
}

function createHandlers() {
  const handlers = {
    get(target, key, receiver) {
      if (key === ReactiveFlags.IS_REACTIVE) {
        return true;
      } else if (
        key === ReactiveFlags.RAW &&
        receiver === reactiveMap.get(target)
      ) {
        return target;
      }

      const res = Reflect.get(target, key, receiver);

      track(target, TrackTypes.GET, key);

      if (isRef(res)) {
        return res.value;
      }

      if (isObject(res)) {
        return reactive(res);
      }

      return res;
    },
    set(target, key, value, receiver) {
      const oldValue = Reflect.get(target, key);

      if (isRef(oldValue) && !isRef(value)) {
        oldValue.value = value;
        return true;
      }

      const hadKey =
        isArray(target) && isIntegerKey(key)
          ? Number(key) < target.length
          : hasOwn(target, key);

      const res = Reflect.set(target, key, value, receiver);

      if (target === toRaw(receiver)) {
        if (!hadKey) {
          trigger(target, TriggerTypes.ADD, key, value);
        } else if (hasChanged(oldValue, value)) {
          trigger(target, TriggerTypes.SET, key, value);
        }
      }

      return res;
    },
    deleteProperty(target, key) {
      const hadKey = hasOwn(target, key);
      const res = Reflect.deleteProperty(target, key);
      if (res && hadKey) {
        trigger(target, TriggerTypes.DELETE, key, void 0);
      }
      return res;
    },
    has(target, key) {
      const res = Reflect.has(target, key);
      track(target, TrackTypes.HAS, key);
      return res;
    },
    ownKeys(target) {
      track(
        target,
        TrackTypes.ITERATE,
        isArray(target) ? 'length' : ITERATE_KEY
      );
      return Reflect.ownKeys(target);
    },
  };
  return handlers;
}

export function toRaw(observed) {
  const raw = observed && observed[ReactiveFlags.RAW];
  return raw ? toRaw(raw) : observed;
}

export const toReactive = (value) =>
  isObject(value) ? reactive(value) : value;

export function isReactive(value) {
  return Boolean(value && value[ReactiveFlags.IS_REACTIVE]);
}

export function isProxy(value) {
  return isReactive(value);
}

/*
 * dep
 */
export const createDep = (effects) => {
  const dep = new Set(effects);
  return dep;
};

/*
 * effect
 */
export let shouldTrack = true;
const trackStack = [];
let activeEffect = null;
const targetMap = new WeakMap();

export class ReactiveEffect {
  active = true;

  deps = [];

  parent = null;

  computed = null;

  allowRecurse = false;

  deferStop = false;

  onStop = null;

  constructor(fn, scheduler) {
    this.fn = fn;
    this.scheduler = scheduler;
  }

  run() {
    if (!this.active) {
      return this.fn();
    }

    let parent = activeEffect;
    while (parent) {
      if (parent === this) {
        return;
      }
      parent = parent.parent;
    }

    const lastShouldTrack = shouldTrack;

    try {
      this.parent = activeEffect;
      activeEffect = this;
      shouldTrack = true;

      return this.fn();
    } finally {
      activeEffect = this.parent;
      shouldTrack = lastShouldTrack;
      this.parent = null;

      if (this.deferStop) {
        this.stop();
      }
    }
  }

  stop() {
    if (activeEffect === this) {
      this.deferStop = true;
    } else if (this.active) {
      cleanupEffect(this);
      if (this.onStop) {
        this.onStop();
      }
      this.active = false;
    }
  }
}

function cleanupEffect(effect) {
  const { deps } = effect;
  for (const dep of deps) {
    dep.delete(effect);
  }
  deps.length = 0;
}

export function effect(fn, opts = {}) {
  if (fn.effect?.fn) {
    fn = fn.effect.fn;
  }

  const _effect = new ReactiveEffect(fn);
  Object.assign(_effect, opts);
  if (!opts.lazy) {
    _effect.run();
  }
  const runner = _effect.run.bind(_effect);
  runner.effect = _effect;
  return runner;
}

export function stop(runner) {
  runner.effect.stop();
}

export function pauseTracking() {
  trackStack.push(shouldTrack);
  shouldTrack = false;
}

export function enableTracking() {
  trackStack.push(shouldTrack);
  shouldTrack = true;
}

export function resetTracking() {
  const last = trackStack.pop();
  shouldTrack = last === void 0 ? true : last;
}

export function track(target, type, key) {
  if (shouldTrack && activeEffect) {
    let depsMap = targetMap.get(target);
    if (!depsMap) {
      targetMap.set(target, (depsMap = new Map()));
    }
    let dep = depsMap.get(key);
    if (!dep) {
      depsMap.set(key, (dep = createDep()));
    }
    trackEffects(dep);
  }
}

export function trackEffects(dep) {
  if (activeEffect && !dep.has(activeEffect)) {
    dep.add(activeEffect);
    activeEffect.deps.push(dep);
  }
}

export function trigger(target, type, key, newVal) {
  const depsMap = targetMap.get(target);
  if (!depsMap) {
    return;
  }

  const deps = [];
  if (key === 'length' && isArray(target)) {
    for (const [key, dep] of depsMap.entries()) {
      if (key === 'length' || key >= newVal) {
        deps.push(dep);
      }
    }
  } else {
    if (key !== void 0) {
      deps.push(depsMap.get(key));
    }
    switch (type) {
      case TriggerTypes.ADD:
        if (!isArray(target)) {
          deps.push(depsMap.get(ITERATE_KEY));
        } else if (isIntegerKey(key)) {
          deps.push(depsMap.get('length'));
        }
        break;
      case TriggerTypes.DELETE:
        if (!isArray(target)) {
          deps.push(depsMap.get(ITERATE_KEY));
        }
        break;
      default:
        break;
    }
  }

  if (deps.length === 1) {
    deps[0] && triggerEffects(deps[0]);
  } else {
    const effects = [];
    for (const dep of deps) {
      dep && effects.push(...dep);
    }
    triggerEffects(createDep(effects));
  }
}

export function triggerEffects(dep) {
  const effects = isArray(dep) ? dep : [...dep];
  for (const effect of effects) {
    if (effect.computed) {
      triggerEffect(effect);
    }
  }
  for (const effect of effects) {
    if (!effect.computed) {
      triggerEffect(effect);
    }
  }
}

function triggerEffect(effect) {
  if (activeEffect !== effect || effect.allowRecurse) {
    if (effect.scheduler) {
      effect.scheduler();
    } else if (effect.run) {
      effect.run();
    }
  }
}

/*
 * ref
 */
export function ref(value) {
  return createRef(value, false);
}

function createRef(rawValue) {
  if (isRef(rawValue)) {
    return rawValue;
  }
  return new RefImpl(rawValue);
}

class RefImpl {
  _value;

  _rawValue;

  dep = void 0;

  __v_isRef = true;

  constructor(value) {
    this._rawValue = toRaw(value);
    this._value = toReactive(value);
  }

  get value() {
    trackRefValue(this);
    return this._value;
  }

  set value(newVal) {
    newVal = toRaw(newVal);
    if (hasChanged(newVal, this._rawValue)) {
      this._rawValue = newVal;
      this._value = toReactive(newVal);
      triggerRefValue(this);
    }
  }
}

export function trackRefValue(ref) {
  if (shouldTrack && activeEffect) {
    ref = toRaw(ref);
    trackEffects(ref.dep || (ref.dep = createDep()));
  }
}

export function triggerRefValue(ref) {
  ref = toRaw(ref);
  if (ref.dep) {
    triggerEffects(ref.dep);
  }
}

export function isRef(r) {
  return Boolean(r && r.__v_isRef === true);
}

export function unref(ref) {
  return isRef(ref) ? ref.value : ref;
}

export function toRefs(object) {
  const ret = isArray(object) ? new Array(object.length) : {};
  for (const key in object) {
    ret[key] = toRef(object, key);
  }
  return ret;
}

export function toRef(object, key, defaultValue) {
  const val = object[key];
  return isRef(val) ? val : new ObjectRefImpl(object, key, defaultValue);
}

class ObjectRefImpl {
  __v_isRef = true;

  constructor(_object, _key, _defaultValue) {
    this._object = _object;
    this._key = _key;
    this._defaultValue = _defaultValue;
  }

  get value() {
    const val = this._object[this._key];
    return val === void 0 ? this._defaultValue : val;
  }

  set value(newVal) {
    this._object[this._key] = newVal;
  }
}

/*
 * computed
 */
export function computed(getter) {
  return new ComputedRefImpl(getter);
}

export class ComputedRefImpl {
  dep = void 0;

  effect;

  _value;

  _dirty = true;

  __v_isRef = true;

  constructor(getter) {
    this.effect = new ReactiveEffect(getter, () => {
      if (!this._dirty) {
        this._dirty = true;
        triggerRefValue(this);
      }
    });
    this.effect.computed = this;
    this.effect.active = true;
  }

  get value() {
    trackRefValue(this);
    if (this._dirty) {
      this._dirty = false;
      this._value = this.effect.run();
    }
    return this._value;
  }
}

export function watch(source, cb, opts) {
  doWatch(source, cb, opts);
}

export function watchEffect(effect, opts) {
  doWatch(effect, null, opts);
}

const INITIAL_WATCHER_VALUE = {};
function doWatch(source, cb, { immediate, flush } = {}) {
  let oldVal = INITIAL_WATCHER_VALUE;

  let getter;
  if (isRef(source)) {
    getter = () => source.value;
  } else if (isReactive(source)) {
    getter = () => source;
  } else if (isFunction(source)) {
    getter = () => source();
  }

  const job = () => {
    if (!effect.active) {
      return;
    }
    if (cb) {
      const newVal = effect.run();
      cb(newVal, oldVal === INITIAL_WATCHER_VALUE ? void 0 : oldVal);
      oldVal = newVal;
    } else {
      effect.run();
    }
  };

  let scheduler;
  if (flush === 'sync') {
    scheduler = job;
  } else if (flush === 'post') {
    scheduler = () => queuePostFlushCb(job);
  } else {
    scheduler = () => queuePreFlushCb(job);
  }

  const effect = new ReactiveEffect(getter, scheduler);

  if (cb) {
    immediate ? job() : (oldVal = effect.run());
  } else if (flush === 'post') {
    queuePostFlushCb(effect.run.bind(effect));
  } else {
    effect.run();
  }

  return () => {
    effect.stop();
  };
}
