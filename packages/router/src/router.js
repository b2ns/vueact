import { computed, inject, reactive, ref } from 'vueact';
import { ROUTER_KEY, ROUTER_VIEW_KEY, ROUTE_KEY } from './constants.js';

export function createRouter(opts) {
  const router = new Router(opts);
  router.install = function (app) {
    const route = {};
    for (const key in START_ROUTE) {
      route[key] = computed(() => router.currentRoute.value[key]);
    }
    app.provide(ROUTER_KEY, router);
    app.provide(ROUTE_KEY, reactive(route));
    app.provide(ROUTER_VIEW_KEY, router.currentRoute);
  };
  return router;
}

class Router {
  constructor(opts) {
    this.routes = opts.routes;
    this.routerHistory = opts.history;
    this.currentRoute = ref(START_ROUTE);
  }

  push(to) {
    to;
  }

  replace(to) {
    to;
  }

  back() {
    return this.go(-1);
  }

  forward() {
    return this.go(1);
  }

  go(delta) {
    return this.routerHistory.go(delta);
  }
}

export const START_ROUTE = {
  path: '/',
  name: void 0,
  params: {},
  query: {},
  hash: '',
  fullPath: '/',
  matched: [],
  meta: {},
  redirectedFrom: void 0,
};

export function useRouter() {
  return inject(ROUTER_KEY);
}

export function useRoute() {
  return inject(ROUTE_KEY);
}
