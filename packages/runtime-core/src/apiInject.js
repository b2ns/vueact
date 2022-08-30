import { isFunction } from '@vueact/shared';
import { currentInstance } from './component';

export function provide(key, value) {
  if (!currentInstance) {
    return;
  }

  let provides = currentInstance.provides;
  const parentProvides =
    currentInstance.parent && currentInstance.parent.provides;
  if (parentProvides === provides) {
    provides = currentInstance.provides = Object.create(parentProvides);
  }
  provides[key] = value;
}

export function inject(key, defaultValue, treatDefaultAsFactory = false) {
  const instance = currentInstance;
  if (!instance) {
    return;
  }

  const provides = instance.parent
    ? instance.parent.provides
    : instance.vnode.appContext && instance.vnode.appContext.provides;
  if (provides && key in provides) {
    return provides[key];
  } else if (arguments.length > 1) {
    return treatDefaultAsFactory && isFunction(defaultValue)
      ? defaultValue.call(instance)
      : defaultValue;
  }
}
