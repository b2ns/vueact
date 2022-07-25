import { isFunction } from '@vueact/shared';
import { createVNode } from './vnode.js';

let uid = 0;

export function createAppAPI(render) {
  return function createApp(rootComponent, rootProps = null) {
    const context = createAppContext();
    const installedPlugins = new Set();

    let isMounted = false;

    const app = (context.app = {
      _uid: uid++,
      _component: rootComponent,
      _props: rootProps,
      _container: null,
      _context: context,
      _instance: null,

      get config() {
        return context.config;
      },

      use(plugin, ...options) {
        if (installedPlugins.has(plugin)) {
          // plugin has been installed
        } else if (plugin && isFunction(plugin.install)) {
          installedPlugins.add(plugin);
          plugin.install(app, ...options);
        } else if (isFunction(plugin)) {
          installedPlugins.add(plugin);
          plugin(app, ...options);
        }
        return app;
      },

      mount(rootContainer) {
        if (!isMounted) {
          const vnode = createVNode(rootComponent, rootProps);
          vnode.appContext = context;

          render(vnode, rootContainer);

          isMounted = true;
          app._container = rootContainer;
        }
      },

      unmount() {
        if (isMounted) {
          render(null, app._container);
        }
      },

      provide(key, value) {
        context.provides[key] = value;

        return app;
      },
    });

    return app;
  };
}

function createAppContext() {
  return {
    app: null,
    config: {
      globalProperties: {},
      errorHandler: undefined,
    },
    provides: Object.create(null),
  };
}
