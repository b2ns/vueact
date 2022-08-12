class PackClient {
  constructor() {
    this.ws = new WebSocket(process.env.SOCKET_ORIGIN, 'pack-hmr');

    this.init();
  }

  static createClient() {
    return new this();
  }

  init() {
    this.ws.addEventListener(
      'open',
      () => {
        console.log(`[ws]: connected`);
      },
      { once: true }
    );

    this.ws.addEventListener('error', (err) => {
      console.error(err);
    });

    this.ws.addEventListener('close', () => {
      console.log(`[ws]: disconneted`);
    });

    this.ws.addEventListener('message', ({ data }) => {
      this.handleMessage(JSON.parse(data));
    });
  }

  send(payload) {
    this.ws.send(JSON.stringify(payload));
  }

  close(...args) {
    this.ws.close(...args);
  }

  handleMessage(payload) {
    switch (payload.type) {
      case 'connected':
        break;
      case 'update':
        for (const update of payload.updates) {
          if (update.type === 'js') {
            queueUpdate(fetchUpdate(update));
          } else {
            let el = document.querySelector(`#${update.id}`);
            if (el) {
              el.innerHTML = update.data;
            } else {
              el = document.createElement('style');
              el.id = update.id;
              el.innerHTML = update.data;
              document.head.appendChild(el);
            }
          }
        }
        break;
      case 'reload':
        location.reload();
        break;
      case 'error':
        break;
      default:
        break;
    }
  }
}
PackClient.createClient();

const hotModulesMap = new Map();

let queued = [];
let pending = false;
function queueUpdate(p) {
  queued.push(p);
  if (!pending) {
    pending = true;
    Promise.resolve().then(() => {
      const loading = [...queued];
      queued = [];
      pending = false;
      Promise.all(loading).then((fns) => {
        for (const fn of fns) {
          fn && fn();
        }
      });
    });
  }
}

async function fetchUpdate({ id, isSelfUpdate, rawPathname, outpath }) {
  const mod = hotModulesMap.get(id);
  if (!mod) {
    return;
  }

  const moduleMap = new Map();

  const modulesToUpdate = new Set();
  if (isSelfUpdate) {
    modulesToUpdate.add(id);
  } else {
    for (const { deps } of mod.callbacks) {
      deps.forEach((dep) => {
        if (rawPathname === dep) {
          modulesToUpdate.add(dep);
        }
      });
    }
  }

  const qualifiedCallbacks = mod.callbacks.filter(({ deps }) =>
    deps.some((dep) => modulesToUpdate.has(dep))
  );

  await Promise.all(
    Array.from(modulesToUpdate).map(async (dep) => {
      try {
        const newMod = await import(outpath);
        moduleMap.set(dep, newMod);
      } catch (e) {
        console.error(e);
      }
    })
  );

  return () => {
    for (const { deps, fn } of qualifiedCallbacks) {
      fn(deps.map((dep) => moduleMap.get(dep)));
    }
  };
}

export function createHMRContext(hostPath) {
  const mod = hotModulesMap.get(hostPath);
  if (mod) {
    mod.callbacks = [];
  }

  const hot = {
    accept(deps, cb) {
      if (!cb) {
        cb = deps;
        deps = [hostPath];
      }

      if (!Array.isArray(deps)) {
        deps = [deps];
      }

      let mod = hotModulesMap.get(hostPath);
      if (!mod) {
        mod = {
          id: hostPath,
          callbacks: [],
        };
        hotModulesMap.set(hostPath, mod);
      }

      mod.callbacks.push({
        deps,
        fn: (mods) => {
          if (mods.length > 1) {
            cb(mods);
          } else {
            cb(mods[0]);
          }
        },
      });
    },
  };
  return hot;
}
