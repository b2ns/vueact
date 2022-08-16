import EventEmitter from 'events';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'fs';
import { createRequire } from 'module';
import { dirname, extname, isAbsolute, join, relative, resolve } from 'path';
import { fileURLToPath } from 'url';
import registerLoaders from './loaders/index.js';
import registerPlugins from './plugins/index.js';
import PackServer from './server/index.js';
import {
  changeExtension,
  createASTNode,
  debounce,
  ensureArray,
  ensurePathPrefix,
  extractEnv,
  genCodeFromAST,
  getGlobalThis,
  getPkgInfo,
  guessFile,
  hash,
  isBuiltin,
  isObject,
  isPkg,
  isRelative,
  isString,
  log,
  recursiveWatch,
  removeItem,
  resolveAlias,
  resolveModuleImport,
  shouldResolveModule,
  Memfs,
} from './utils.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const require = createRequire(import.meta.url);

let pkgBundleUID = 0;

class Pack {
  constructor({
    root = './',
    entry = './src/main.js',
    output = './dist',
    resolve: resolveOpts = {},
    loaders = [],
    plugins = [],
    watch = false,
    target = 'default', // default(web), node
    define = {},
    preview = false,
    server = {},
  }) {
    this.root = resolve(root);
    this.entry = resolve(this.root, entry);
    this.output = resolve(this.root, output);
    this.resolveOpts = resolveOpts;
    this.loaders = loaders;
    this.plugins = plugins;
    this.watch = watch;
    this.target = target;
    this.define = define;
    this.preview = preview;
    this.server = server;

    this.modules = new Map();
    this.graph = null;
    this.events = new EventEmitter();
    this.memfs = this.watch ? new Memfs() : null;
    this.pkgModules = new Map();

    this._resolvedPKG = new Map();

    // loader and plugin shared data
    this.shared = {};

    this.injectGlobalCode();

    if (this.watch) {
      this.loaders.push(createInjectClientLoader());
    }
  }

  static pack(config) {
    new Pack(config).run();
  }

  run() {
    // only start the server while preview
    if (this.preview) {
      this.startServer();
      return;
    }

    const startTime = process.hrtime();

    this.applyPlugins();

    this.events.emit('start', this.injectHelper());

    this.graph = this.resolveDependencis();
    this.graph.isRoot = true;

    this.applyLoaders();

    const pkgModule = this.bundlePkgModule(this.graph);
    this.transformPkgImport(this.graph);
    const modulesToWrite = [pkgModule];
    for (const mod of this.modules.values()) {
      if (!mod.pkgInfo || mod.type !== 'script') {
        modulesToWrite.push(mod);
      }
    }
    this.writeContent(modulesToWrite);

    const endTime = process.hrtime(startTime);

    log(`build done: ${endTime[0] + endTime[1] / 1e9} s`);

    if (this.watch) {
      // set all modules to unchanged
      for (const mod of this.modules.values()) {
        mod.changing = false;
      }

      this.doWatch();

      const app = this.startServer();
      app.httpServer.once('listening', () => {
        this.injectGlobalCode({
          'env.SOCKET_ORIGIN': app.origin.replace(/^http/, 'ws'),
        });

        this.events.emit('end', this.injectHelper());
      });
      this.app = app;
    } else {
      this.events.emit('end', this.injectHelper());
    }
  }

  /*
   * resolve dependence graph
   */
  resolveDependencis(entry = this.entry, extra = {}) {
    const that = this;
    const { modules, events, root, resolveOpts, target, watch, _resolvedPKG } =
      this;
    const { extensions, alias } = resolveOpts;

    const graph = doResolve(entry, null, null);

    function doResolve(pathOrMod, parentModule, pkgInfo) {
      let mod = null;
      let id = '';
      if (isObject(pathOrMod)) {
        mod = pathOrMod;
        id = pathOrMod.id;
      } else {
        id = pathOrMod;
      }

      const cached = modules.get(id);
      if (cached) {
        parentModule && cached.parents.push(parentModule);
        return cached;
      }

      if (!mod) {
        mod = createModule(id);
      }

      modules.set(id, mod);

      if (extra.addedModules) {
        extra.addedModules.set(id, mod);
      }

      parentModule && mod.parents.push(parentModule);

      if (!mod.pkgInfo) {
        mod.pkgInfo = pkgInfo;
      }

      const content = readFileSync(id);

      if (mod.pkgInfo) {
        mod.outpath = mod.pkgInfo.__outpath__;
      } else {
        mod.outpath = relative(root, id);
        mod.hash = hash(content);
        if (!watch) {
          mod.outpath = mod.outpath.replace(/\.(\w+)$/, `_${mod.hash}.$1`);
        }
      }

      events.emit('moduleCreated', that.injectHelper({ mod }));

      if (shouldResolveModule(id)) {
        mod.type = 'script';
        const cwd = dirname(id);
        mod.content = content.toString();
        events.emit('beforeModuleResolve', that.injectHelper({ mod }));
        const ast = resolveModuleImport(mod.content);
        delete mod.content;
        mod.ast = ast;

        for (const node of ast) {
          if (node.type !== 'import') {
            continue;
          }
          resolveAlias(alias, node);
          if (isBuiltin(node.pathname)) {
            continue;
          }

          let _pkgInfo = null;

          // subpath import from owen package
          // https://nodejs.org/api/packages.html#subpath-imports
          if (pkgInfo && node.pathname.startsWith('#')) {
            let filepath = pkgInfo.imports[node.pathname];
            if (isObject(filepath)) {
              filepath = filepath[target];
            }
            const pathname = ensurePathPrefix(
              relative(cwd, join(pkgInfo.__root__, filepath))
            );
            node.setPathname(pathname);
          }

          node.absPath = node.pathname;

          if (isRelative(node.pathname) || isAbsolute(node.pathname)) {
            if (!isAbsolute(node.pathname)) {
              node.absPath = join(cwd, node.pathname);
            }

            const absPath = guessFile(node.absPath, extensions);
            if (absPath !== node.absPath) {
              node.absPath = absPath;
              node.setPathname(ensurePathPrefix(relative(cwd, node.absPath)));
            }

            if (pkgInfo) {
              _pkgInfo = { ...pkgInfo };
              _pkgInfo.__outpath__ = join(
                dirname(pkgInfo.__outpath__),
                node.pathname
              );
            }
          } else if (isPkg(node.pathname)) {
            let pkgCacheKey = node.pathname;
            if (pkgInfo) {
              pkgCacheKey = `${pkgInfo.name}@${pkgInfo.version}/${pkgCacheKey}`;
            }
            if (_resolvedPKG.has(pkgCacheKey)) {
              const cached = _resolvedPKG.get(pkgCacheKey);
              node.absPath = cached.absPath;
              _pkgInfo = { ...cached.pkgInfo };
              node.setPathname(_pkgInfo.__outpath__);
            } else {
              let pkgName = node.pathname;
              let mainFile = '';
              const isScoped = pkgName.startsWith('@');
              const segments = pkgName.split('/');
              const cuttingIndex = isScoped ? 2 : 1;
              // import from subpath
              // e.g. import xxx from '@vueact/shared/src/xxx.js'
              if (segments.length > cuttingIndex) {
                pkgName = segments.slice(0, cuttingIndex).join('/');
                mainFile = segments.slice(cuttingIndex).join('/');
              }

              let resolvedPath = '';

              const tryMainPath = () => {
                resolvedPath = require.resolve(pkgName, {
                  paths: [cwd],
                });

                _pkgInfo = getPkgInfo(resolvedPath);

                if (!mainFile) {
                  // subpath exports
                  // https://nodejs.org/api/packages.html#subpath-exports
                  const { exports: _exports } = _pkgInfo;

                  mainFile =
                    (isObject(_exports)
                      ? isObject(_exports['.'])
                        ? _exports['.'].default
                        : _exports['.']
                      : _exports) ||
                    _pkgInfo.main ||
                    _pkgInfo.module ||
                    'index.js';
                }
                node.absPath = join(_pkgInfo.__root__, mainFile);

                const absPath = guessFile(node.absPath, extensions);
                if (absPath !== node.absPath) {
                  node.absPath = absPath;
                  mainFile = relative(_pkgInfo.__root__, absPath);
                }
              };

              const trySubPath = () => {
                resolvedPath = require.resolve(node.pathname, {
                  paths: [cwd],
                });
                _pkgInfo = getPkgInfo(resolvedPath);
                mainFile = relative(_pkgInfo.__root__, resolvedPath);
                node.absPath = resolvedPath;

                const absPath = guessFile(node.absPath, extensions);
                if (absPath !== node.absPath) {
                  node.absPath = absPath;
                  mainFile = relative(_pkgInfo.__root__, absPath);
                }
              };

              if (!mainFile) {
                tryMainPath();
              } else {
                try {
                  trySubPath();
                } catch (error) {
                  tryMainPath();
                }
              }

              const outpath = join(
                '/.pack',
                `${_pkgInfo.name}@${_pkgInfo.version || ''}`,
                `${mainFile}`
              );

              _pkgInfo.__outpath__ = outpath;

              node.setPathname(outpath);

              _resolvedPKG.set(pkgCacheKey, {
                absPath: node.absPath,
                pkgInfo: { ..._pkgInfo },
              });
            }
          }

          mod.dependencis.push(
            doResolve(node.absPath, mod, _pkgInfo || pkgInfo)
          );

          const nodeMod = modules.get(node.absPath);
          if (!watch) {
            if (nodeMod.hash) {
              node.setPathname(
                node.pathname.replace(/\.(\w+)$/, `_${nodeMod.hash}.$1`)
              );
            }
          }
        }

        events.emit('moduleResolved', that.injectHelper({ mod }));
      }

      return mod;
    }

    return graph;
  }

  /*
   * apply loader on each imported module
   */
  applyLoaders(modules) {
    const that = this;
    const { loaders } = this;
    if (!loaders || !loaders.length) {
      return;
    }

    if (!modules) {
      modules = [...this.modules.values()];
    }
    modules = ensureArray(modules);

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

          const use = [...loader.use].reverse();
          for (let fn of use) {
            let opts = void 0;
            if (Array.isArray(fn)) {
              opts = fn[1];
              fn = fn[0];
            }
            if (isString(fn)) {
              fn = registerLoaders[fn];
            }
            fn(that.injectHelper({ mod }), opts);
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
   * bundle package module to reduce http request
   */
  bundlePkgModule(root) {
    const { pkgModules } = this;
    const handled = new Set();
    const _pkgModules = [];
    const loadedPkgModules = new Set();

    doBundle(root);

    function doBundle(mod) {
      if (handled.has(mod.id)) {
        return;
      }
      handled.add(mod.id);

      if (mod.pkgInfo && mod.type === 'script') {
        if (pkgModules.has(mod.id)) {
          const loaded = pkgModules.get(mod.id);
          loadedPkgModules.add(loaded);
          mod.walkParentASTNode(
            (node) => {
              node.setPathname(mod.uid);
              node.code = node.code.replace('require', loaded.__requireName);
            },
            false,
            (parent) => Boolean(parent.pkgInfo)
          );
          return;
        }

        mod.walkParentASTNode(
          (node) => {
            node.setPathname(mod.uid);
          },
          false,
          (parent) => Boolean(parent.pkgInfo)
        );

        _pkgModules.push(mod);
      }

      if (mod.dependencis.length) {
        for (const dep of mod.dependencis) {
          doBundle(dep);
        }
      }
    }

    if (!_pkgModules.length) {
      return;
    }

    let pkgModuleCode = '';
    for (const mod of _pkgModules) {
      pkgModuleCode += `'${
        mod.uid
      }': (exports, module, require) => {\n${genCodeFromAST(mod.ast)}\n},\n`;
    }

    let loadedPkgCode = '';
    for (const mod of loadedPkgModules) {
      loadedPkgCode += `import ${mod.__requireName} from '${mod.outpath}';\n`;
    }

    const content = `${loadedPkgCode}
const __modules__ = {
${pkgModuleCode}
};
const __cachedModules__ = {};
function __require__(moduleId) {
  if (__cachedModules__[moduleId] !== void 0) {
    return __cachedModules__[moduleId].exports;
  }
  const module = (__cachedModules__[moduleId] = { exports: {} });
  __modules__[moduleId](module.exports, module, __require__);
  try{module.exports.default = module.exports.default || module.exports;}catch(e){}
  return module.exports;
}
export default __require__;
`;

    const pathname = `/.pack/__pack_pkg_bundle_${pkgBundleUID}_${hash(
      content
    )}.js`;
    const pkgModule = createModule(pathname);
    pkgModule.outpath = pathname;
    pkgModule.content = content;
    pkgModule.__requireName = `__pack_pkg_require_${pkgBundleUID}__`;
    pkgBundleUID++;

    for (const mod of _pkgModules) {
      this.pkgModules.set(mod.id, pkgModule);
    }
    return pkgModule;
  }

  transformPkgImport(root) {
    const { pkgModules } = this;
    const handled = new Set();
    doTransform(root);
    function doTransform(mod) {
      if (handled.has(mod.id)) {
        return;
      }
      handled.add(mod.id);

      if (mod.pkgInfo && mod.type === 'script') {
        const pkgModule = pkgModules.get(mod.id);

        mod.walkParentASTNode(
          (node, ast) => {
            let importVars = '';
            if (node.imported) {
              for (const imported of node.imported) {
                if (imported.default || imported.importAll) {
                  importVars = `default: ${imported.alias || imported.name},`;
                } else {
                  if (imported.alias && imported.alias !== imported.name) {
                    importVars += `${imported.name}: ${imported.alias},`;
                  } else {
                    importVars += `${imported.name},`;
                  }
                }
              }
              if (importVars) {
                importVars = importVars.slice(0, -1);
              }
            }

            let code = '';
            const requireCode = `${pkgModule.__requireName}('${mod.uid}');`;
            if (importVars) {
              code += `const {${importVars}} = ${requireCode}`;
            } else {
              code += `${requireCode}`;
            }

            removeItem(ast, node, createASTNode('', code));

            if (!ast[pkgModule.__requireName]) {
              ast.unshift(
                createASTNode(
                  '',
                  `import ${pkgModule.__requireName} from '${pkgModule.outpath}';\n`
                )
              );
              ast[pkgModule.__requireName] = true;
            }
          },
          false,
          (parent) => Boolean(!parent.pkgInfo)
        );
      }

      if (!mod.pkgInfo && mod.type === 'script' && mod.dependencis.length) {
        for (const dep of mod.dependencis) {
          doTransform(dep);
        }
      }
    }
  }

  /*
   * register plugin hooks
   */
  applyPlugins() {
    const { plugins, events } = this;
    if (!plugins || !plugins.length) {
      return;
    }

    for (let plugin of plugins) {
      let opts = void 0;
      if (Array.isArray(plugin)) {
        opts = plugin[1];
        plugin = plugin[0];
      }
      if (isString(plugin)) {
        plugin = registerPlugins[plugin];
      }
      plugin(this.injectHelper({ events }, false), opts);
    }
  }

  /*
   * write to the disk
   */
  writeContent(modules) {
    if (!modules) {
      return;
    }
    modules = ensureArray(modules);

    const { output, events, memfs } = this;

    if (!memfs && !existsSync(output)) {
      mkdirSync(output, { recursive: true });
    }

    for (const mod of modules) {
      events.emit('beforeModuleWrite', this.injectHelper({ mod }));

      if (mod.noWrite) {
        continue;
      }

      const dest = join(output, mod.outpath);
      if (memfs) {
        if (mod.ast) {
          memfs.write(dest, genCodeFromAST(mod.ast));
        } else if (mod.content) {
          memfs.write(dest, mod.content);
        } else {
          memfs.write(dest, readFileSync(mod.id));
        }
      } else {
        const dir = dirname(dest);
        if (!existsSync(dir)) {
          mkdirSync(dir, { recursive: true });
        }

        if (mod.ast) {
          const code = genCodeFromAST(mod.ast);
          writeFileSync(dest, code);
        } else if (mod.content) {
          writeFileSync(dest, mod.content);
        } else {
          copyFileSync(mod.id, dest);
        }
      }

      events.emit('moduleWrited', this.injectHelper({ mod }));
    }
  }

  /*
   * watch the file change and repack
   */
  doWatch() {
    log('watching ...');

    const changedFiles = new Set();
    const repack = debounce(() => {
      const updates = [];
      for (const filename of changedFiles) {
        const mod = this.modules.get(filename);

        if (!mod) return;

        const newHash = hash(readFileSync(filename));
        if (mod.hash === newHash) {
          return;
        }

        log(`changing: ${filename}`);

        mod.reset();
        this.modules.delete(mod.id);

        // only new added module need write
        const addedModules = new Map();
        this.resolveDependencis(mod, {
          addedModules,
        });
        addedModules.delete(mod.id);

        this.applyLoaders([mod, ...mod.dependencis]);

        const pkgModule = this.bundlePkgModule(mod);
        this.transformPkgImport(mod);
        const modulesToWrite = [mod];
        if (pkgModule) {
          modulesToWrite.push(pkgModule);
        }
        for (const mod of addedModules.values()) {
          if (!mod.pkgInfo || mod.type !== 'script') {
            modulesToWrite.push(mod);
          }
          mod.changing = false;
        }
        this.writeContent(modulesToWrite);

        mod.changing = false;

        if (mod.type === 'style') {
          updates.push({ type: 'style', id: mod.id, content: mod.content });
        } else if (mod.type === 'script') {
          const outpath = ensurePathPrefix(mod.outpath) + `?hash=${mod.hash}`;
          updates.push({
            type: 'js',
            id: mod.id,
            isSelfUpdate: true,
            outpath,
          });

          const propagate = (mod) => {
            const { parents } = mod;
            if (!parents || !parents.length) {
              return;
            }
            const outpath = ensurePathPrefix(mod.outpath) + `?hash=${mod.hash}`;

            for (const parent of mod.parents) {
              updates.push({
                type: 'js',
                id: parent.id,
                isSelfUpdate: false,
                rawPathname: parent.ast.find(
                  ({ absPath }) => absPath === mod.id
                ).rawPathname,
                outpath,
              });

              propagate(parent);
            }
          };

          propagate(mod);
        }

        changedFiles.delete(filename);
      }

      if (updates.length) {
        this.app.send({ type: 'update', updates });
      } else {
        this.app.send({ type: 'reload' });
      }
    });

    recursiveWatch(dirname(this.entry), (event, filename) => {
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
      dev: this.watch,
      https: this.server.https,
      memfs: this.memfs,
    }).listen();
  }

  /*
   * inject global runtime code, load via html-plugin
   * e.g. process.env.NODE_ENV
   */
  injectGlobalCode(vars, code) {
    if (this.target !== 'default') {
      return;
    }

    if (!this.shared.GLOBAL_SCRIPT) {
      this.shared.GLOBAL_SCRIPT = `${getGlobalThis.toString()}
var __global__ = getGlobalThis();
__global__.process = { env: ${JSON.stringify({
        ...extractEnv(['NODE_ENV']),
        ...this.define,
      })}};
`;
    }

    let varKeys = null;
    if (vars && (varKeys = Object.keys(vars)).length) {
      this.shared.GLOBAL_SCRIPT += varKeys
        .map(
          (key) =>
            `__global__.process${
              key.startsWith('[') ? key : '.' + key
            } = ${JSON.stringify(vars[key])};`
        )
        .join('\n');
    }

    if (code) {
      this.shared.GLOBAL_SCRIPT += code;
    }
  }

  injectHelper(obj, injectThis = true) {
    return {
      ...(injectThis ? this : {}),
      ...obj,
      createASTNode,
    };
  }

  removeModule(mod) {
    this.modules.delete(mod.id);
    for (const dep of mod.dependencis) {
      removeItem(dep.parents, mod);
    }
    for (const parent of mod.parents) {
      removeItem(parent.dependencis, mod);
    }
  }
}

let moduleUID = 0;
class Module {
  constructor(id) {
    this.uid = moduleUID++;
    this.id = id;
    this.type = '';
    this.extension = extname(id);
    this._extensionChanged = false;
    this._currentPath = id;
    this.outpath = '';
    this.ast = null;
    this.content = '';
    this.noWrite = false;
    this.pkgInfo = null;
    this.hash = '';
    this.parents = [];
    this.dependencis = [];
    this.isRoot = false;
    this._injectedHMR = false;
    this.changing = true;
  }

  reset() {
    for (const dep of this.dependencis) {
      removeItem(dep.parents, this);
    }

    this._extensionChanged = false;
    this._currentPath = this.id;
    this.outpath = '';
    this.ast = null;
    this.content = '';
    this.noWrite = false;
    this.hash = '';
    this.dependencis = [];
    this._injectedHMR = false;
    this.changing = true;
  }

  changeExtension(ext) {
    const pathname = changeExtension(this._currentPath, ext);

    if (pathname !== this._currentPath) {
      this._extensionChanged = true;
      this._currentPath = pathname;
      this.outpath = changeExtension(this.outpath, ext);

      this.walkParentASTNode((node) => {
        node.changeExtension(ext);
      });
    }
  }

  walkParentASTNode(cb, checkAllNodes = false, parentFilter) {
    let { parents } = this;
    if (parentFilter) {
      parents = parents.filter(parentFilter);
    }
    if (!parents.length) {
      return;
    }

    for (const parent of parents) {
      if (!parent.changing) {
        continue;
      }
      for (const node of parent.ast) {
        if (checkAllNodes || node.absPath === this.id) {
          cb(node, parent.ast);
        }
      }
    }
  }

  walkASTNode(cb) {
    if (!this.ast) {
      return;
    }
    for (const node of this.ast) {
      cb(node, this.ast);
    }
  }

  skipWrite() {
    this.noWrite = true;
  }
}

function createModule(id) {
  return new Module(id);
}

function createInjectClientLoader() {
  const code = readFileSync(join(__dirname, './client/index.js'));
  const pathname = `/__pack_client__${hash(code)}.js`;
  const clientModule = createModule(pathname);
  clientModule.outpath = pathname;
  clientModule.content = code;

  return {
    test: /\.js$/,
    exclude: /node_modules|\.json\.js$/,
    include: /\.css\.js$/,
    use: [
      ({ mod, modules, createASTNode }) => {
        if (mod._injectedHMR) {
          return;
        }

        mod._injectedHMR = true;

        if (!modules.has(pathname)) {
          modules.set(pathname, clientModule);
        }

        mod.ast.unshift(
          createASTNode(
            '',
            `import { createHMRContext as __createHMRContext__${
              mod.type === 'style' ? ', updateStyle as __updateStyle__' : ''
            } } from '${pathname}';
import.meta.hot = __createHMRContext__('${mod.id}');\n`
          )
        );
      },
    ],
  };
}

export default (config) => Pack.pack(config);
