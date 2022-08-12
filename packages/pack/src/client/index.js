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
            updateStyle(update.id, update.content);
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

const styleMap = new Map();
export function updateStyle(id, content) {
  let style = styleMap.get(id);
  if (!style) {
    style = document.createElement('style');
    style.innerHTML = content;
    document.head.appendChild(style);
    styleMap.set(id, style);
  } else {
    style.innerHTML = content;
  }
}

const hotModulesMap = new Map();

let queued = [];
let pending = false;
async function queueUpdate(p) {
  queued.push(p);
  if (!pending) {
    pending = true;
    await Promise.resolve();
    const loading = [...queued];
    queued = [];
    // eslint-disable-next-line require-atomic-updates
    pending = false;
    for (const fn of await Promise.all(loading)) {
      fn && fn();
    }
  }
}

async function fetchUpdate({ id, isSelfUpdate, rawPathname, outpath }) {
  const mod = hotModulesMap.get(id);
  if (!mod) {
    return;
  }

  const newModuleMap = new Map();

  const modulesToUpdate = new Set();
  if (isSelfUpdate) {
    modulesToUpdate.add(id);
  } else {
    if (mod.callbackMap.has(rawPathname)) {
      modulesToUpdate.add(rawPathname);
    }
  }

  await Promise.all(
    [...modulesToUpdate].map(async (dep) => {
      try {
        const newMod = await import(outpath);
        newModuleMap.set(dep, newMod);
      } catch (e) {
        console.error(e);
      }
    })
  );

  const callbacks = [...modulesToUpdate].reduce((arr, dep) => {
    if (mod.callbackMap.has(dep)) {
      arr.push(...mod.callbackMap.get(dep));
    }
    return arr;
  }, []);

  return () => {
    for (const fn of callbacks) {
      fn(fn.deps.map((dep) => newModuleMap.get(dep)));
    }
  };
}

export function createHMRContext(hostPath) {
  const mod = hotModulesMap.get(hostPath);
  if (mod) {
    mod.callbackMap = new Map();
  }

  const hot = {
    accept(deps, cb) {
      if (!deps || !cb) {
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
          callbackMap: new Map(),
        };
        hotModulesMap.set(hostPath, mod);
      }

      const fn = (mods) => {
        if (cb) {
          mods.length > 1 ? cb(mods) : cb(mods[0]);
        }
      };
      fn.deps = deps;

      for (const dep of deps) {
        let callbacks = mod.callbackMap.get(dep);
        if (!callbacks) {
          callbacks = [];
          mod.callbackMap.set(dep, callbacks);
        }
        callbacks.push(fn);
      }
    },
  };
  return hot;
}
