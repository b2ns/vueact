export * from './utils.js';
export * from './reactivity.js';
export { nextTick } from './scheduler.js';
export { h } from './vnode.js';
export { createRenderer } from './renderer.js';
export { onBeforeMount, onMounted, onBeforeUpdate, onUpdated, onBeforeUnmount, onUnmounted } from './component.js';

import { render } from './domRender.js';
import { createAppAPI } from './apiCreateApp.js';
import { isString } from './utils.js';

const createApp_ = createAppAPI(render);
export const createApp = (...args) => {
  const app = createApp_(...args);
  const { mount } = app;
  app.mount = (container) => {
    if (isString(container)) {
      container = document.querySelector(container);
    }
    container.innerHTML = '';
    return mount(container);
  };
  return app;
};
