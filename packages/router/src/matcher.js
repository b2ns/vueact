export default class RouterMatcher {
  constructor(routes) {
    this.matchers = [];
    this.matcherMap = new Map();
    routes.forEach((route) => this.addRoute(route));
  }

  getMatcher(name) {
    return this.matcherMap.get(name);
  }

  getRoutes() {
    return this.matchers;
  }

  addRoute(record, parent) {
    const normalizedRecord = { ...record };
    const matcher = null;

    if (parent && normalizedRecord.path[0] !== '/') {
      normalizedRecord.path = `${parent.path}${
        parent.path[parent.path.length - 1] === '/' ? '' : '/'
      }${normalizedRecord.path}`;
    }

    if (normalizedRecord.children) {
      for (const child of normalizedRecord.children) {
        this.addRoute(child, matcher);
      }
    }
  }

  removeRoute() {}

  resolve() {}
}
