import EventEmitter from 'node:events';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { splitChunks } from './chunk.js';
import { hmrUpdate } from './hmr.js';
import registeredLoaders from './loaders/index.js';
import createInjectClientLoader from './loaders/_injectClientLoader.js';
import { ModuleGraph } from './module.js';
import registeredPlugins from './plugins/index.js';
import PackServer from './server/index.js';
import {
  createASTNode,
  debounce,
  extractEnv,
  getGlobalThis,
  hash,
  isString,
  log,
  Memfs,
  openBrowser,
  recursiveWatch,
} from './utils.js';

class Pack {
  constructor({
    root = './',
    entry = './src/main.js',
    output = './dist',
    resolve: resolveOpts = {},
    loaders = [],
    plugins = [],
    mode = 'production',
    target = 'default', // default(web), node
    define = {},
    preview = false,
    server = {},
    open = false,
  }) {
    // configuration
    this.root = resolve(root);
    this.entry = resolve(this.root, entry);
    this.output = resolve(this.root, output);
    this.resolveOpts = resolveOpts;
    this.loaders = loaders;
    this.plugins = plugins;
    this.mode = mode;
    this.target = target;
    this.define = define;
    this.preview = preview;
    this.server = server;
    this.open = open;

    process.env.NODE_ENV = mode;
    this.dev = mode !== 'production';

    this.graph = new ModuleGraph();

    this.events = new EventEmitter();

    // use im-memory files in development mode
    this.memfs = this.dev ? new Memfs() : null;

    // loader and plugin shared data
    this.shared = {};
  }

  static pack(config) {
    new Pack(config).run();
  }

  emit = (eventName, ...rest) => {
    this.events.emit(eventName, this.injectHelper(...rest));
  };

  run() {
    // only start the server while preview
    if (this.preview) {
      this.startServer().once('start', ({ origin }) => {
        if (this.open) {
          openBrowser(origin);
        }
      });
      return;
    }

    const { graph, emit, dev } = this;

    const startTime = Date.now();

    emit('start');

    this.injectGlobalRuntime();

    this.registerPlugins();

    this.resolveModuleGraph(this.entry, { setRoot: true });

    if (dev) {
      this.loaders.push(createInjectClientLoader());
    }
    this.applyLoaders(graph.modules);

    const chunks = splitChunks(graph.root, { appendHash: !this.dev });
    this.writeChunks(chunks);

    const endTime = Date.now();

    let buildTime = endTime - startTime;
    if (buildTime > 1000) {
      buildTime = (buildTime / 1000).toFixed(2) + ' s';
    } else {
      buildTime = buildTime + ' ms';
    }

    log(`build done: ${buildTime}`);

    if (dev) {
      // set all modules to unchanged
      for (const mod of graph.modules) {
        mod.changing = false;
      }

      this.app = this.startServer().once('start', ({ origin }) => {
        this.injectGlobalRuntime({
          'env.SOCKET_ORIGIN': origin.replace(/^http/, 'ws'),
        });

        emit('end', { chunks });

        if (this.open) {
          openBrowser(origin);
        }
      });

      this.doWatch();
    } else {
      emit('end', { chunks });
    }
  }

  /*
   * resolve module graph
   */
  resolveModuleGraph(entry, extra = {}) {
    const { graph, emit, root, resolveOpts, target } = this;
    return graph.resolve(entry, {
      emit,
      root,
      resolveOpts,
      target,
      extra,
    });
  }

  /*
   * apply loader on each imported module
   */
  applyLoaders(modules) {
    const { loaders, injectHelper } = this;
    if (!loaders.length) {
      return;
    }

    // modules = ensureArray(modules);

    doApply(modules);

    function doApply(modules) {
      const extensionChangedModules = new Set();

      for (const mod of modules) {
        for (const loader of loaders) {
          if (
            !loader.test ||
            !loader.test.test(mod._currentPath) ||
            !loader.use ||
            !loader.use.length ||
            (loader.exclude &&
              loader.exclude.test(mod._currentPath) &&
              !(loader.include && loader.include.test(mod._currentPath)))
          ) {
            continue;
          }

          for (let i = loader.use.length - 1; i >= 0; i--) {
            let fn = loader.use[i];
            let opts = void 0;
            if (Array.isArray(fn)) {
              opts = fn[1];
              fn = fn[0];
            }
            if (isString(fn)) {
              fn = registeredLoaders[fn];
            }
            fn(injectHelper({ mod }), opts);
          }

          if (mod._extensionChanged) {
            extensionChangedModules.add(mod);
            mod._extensionChanged = false;
          }
        }
      }

      if (extensionChangedModules.size) {
        const modules = [...extensionChangedModules.values()];
        doApply(modules);
        for (const mod of modules) {
          mod._currentPath = mod.id;
        }
      }
    }
  }

  /*
   * register plugin hooks
   */
  registerPlugins() {
    const { plugins, events, injectHelper } = this;
    if (!plugins.length) {
      return;
    }

    for (let plugin of plugins) {
      let opts = void 0;
      if (Array.isArray(plugin)) {
        opts = plugin[1];
        plugin = plugin[0];
      }
      if (isString(plugin)) {
        plugin = registeredPlugins[plugin];
      }
      plugin(injectHelper({ events }, false), opts);
    }
  }

  /*
   * write the chunks
   */
  writeChunks(chunks) {
    const { output, emit, memfs } = this;

    if (!memfs && !existsSync(output)) {
      mkdirSync(output, { recursive: true });
    }

    for (const chunk of chunks) {
      emit('beforeChunkWrite', { chunk });

      const dest = join(output, chunk.outpath);

      if (!memfs) {
        const dir = dirname(dest);
        if (!existsSync(dir)) {
          mkdirSync(dir, { recursive: true });
        }
      }

      if (chunk.content) {
        memfs
          ? memfs.write(dest, chunk.content)
          : writeFileSync(dest, chunk.content);
      } else {
        memfs
          ? memfs.write(dest, readFileSync(chunk.id))
          : copyFileSync(chunk.id, dest);
      }

      emit('chunkWrited', { chunk });
    }
  }

  /*
   * watch the file change and repack
   */
  doWatch() {
    log('watching ...');

    const { graph, entry, app } = this;
    const changedFiles = new Set();

    const repack = debounce(() => {
      const updateModules = [];

      for (const id of changedFiles) {
        const mod = graph.getModule(id);
        if (!mod) return;

        const newHash = hash(readFileSync(id));
        if (mod.hash === newHash) {
          return;
        }

        log(`changing: ${relative(dirname(entry), id)}`);

        mod.reset();
        graph.deleteModule(mod.id);

        // only new added module need write
        const addedModules = new Map();
        this.resolveModuleGraph(mod, {
          addedModules,
        });
        // addedModules.delete(mod.id);

        this.applyLoaders([mod, ...mod.dependencis]);

        const chunks = splitChunks(mod, { addedModules });
        this.writeChunks(chunks);

        mod.changing = false;

        changedFiles.delete(id);
        updateModules.push(mod);
      }

      hmrUpdate(updateModules, app);
    });

    recursiveWatch(dirname(entry), (event, filename) => {
      if (event !== 'change') {
        return;
      }
      changedFiles.add(filename);
      repack();
    });
  }

  /*
   * start dev server
   */
  startServer() {
    return PackServer.createServer({
      root: join(this.output),
      dev: this.dev,
      https: this.server.https,
      memfs: this.memfs,
    }).listen();
  }

  /*
   * inject global runtime code, load via html-plugin
   * e.g. process.env.NODE_ENV
   */
  injectGlobalRuntime(vars, code) {
    if (this.target !== 'default') {
      return;
    }

    if (!this.shared.GLOBAL_RUNTIME) {
      this.shared.GLOBAL_RUNTIME = `${getGlobalThis.toString()}
var __global__ = getGlobalThis();
__global__.process = {env: ${JSON.stringify({
        ...extractEnv(['NODE_ENV']),
        ...this.define,
      })}};\n`;
    }

    let varKeys = null;
    if (vars && (varKeys = Object.keys(vars)).length) {
      this.shared.GLOBAL_RUNTIME +=
        '\n' +
        varKeys
          .map(
            (key) =>
              `__global__.process${
                key.startsWith('[') ? key : '.' + key
              } = ${JSON.stringify(vars[key])};`
          )
          .join('\n');
    }

    if (code) {
      this.shared.GLOBAL_RUNTIME += `\n${code}`;
    }
  }

  injectHelper = (obj) => {
    const {
      graph,
      root,
      entry,
      output,
      mode,
      dev,
      target,
      events,
      memfs,
      shared,
    } = this;
    return {
      graph,
      root,
      entry,
      output,
      mode,
      dev,
      target,
      events,
      memfs,
      shared,
      ...obj,
      createASTNode,
    };
  };
}

export default (config) => Pack.pack(config);
