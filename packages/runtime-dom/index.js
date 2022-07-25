import { render } from './src/index.js';
import { createAppAPI } from '@vueact/runtime-core';
import { isString } from '@vueact/shared';

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
