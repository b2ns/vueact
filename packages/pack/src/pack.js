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
  log,
  recursiveWatch,
  removeItem,
  resolveAlias,
  resolveModuleImport,
  shouldResolveModule,
} from './utils.js';

const require = createRequire(import.meta.url);

const HASH_LEN = 8;

class Pack {
  constructor({
    root = './',
    entry = './src/main.js',
    output = './dist',
    resolve: resolveOpts = {},
    loaders,
    plugins,
    watch,
    target = 'default', // default(web), node
    define = {},
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

    this.modules = new Map();
    this.graph = null;
    this.events = new EventEmitter();
  }

  static pack(config) {
    new Pack(config).run();
  }

  run() {
    this.applyPlugins();

    this.events.emit('start', this.injectHelper());

    this.graph = this.resolveDependencis();

    this.applyLoaders();

    this.injectGlobalCode();

    this.writeContent();

    this.events.emit('end', this.injectHelper());

    log('build done');

    if (this.watch) {
      this.doWatch();
    }
  }

  /*
   * resolve dependence graph
   */
  resolveDependencis(entry = this.entry, extra = {}) {
    const that = this;
    const { modules, events, root, resolveOpts, target, watch } = this;
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

      if (mod.pkgInfo) {
        mod.outpath = mod.pkgInfo.__outpath__;
      } else {
        mod.hash = hash(readFileSync(id));
        if (!mod.outpath) {
          mod.outpath = relative(root, id);
        }

        if (!watch) {
          const hashCode = mod.hash.slice(0, HASH_LEN);
          const ext = extname(mod.outpath);
          mod.outpath = ext
            ? mod.outpath.replace(new RegExp(`${ext}$`), `_${hashCode}${ext}`)
            : `${mod.outpath}_${hashCode}`;
        }
      }

      events.emit('moduleCreated', that.injectHelper({ mod }));

      if (shouldResolveModule(id)) {
        mod.type = 'script';
        const cwd = dirname(id);
        const content = readFileSync(id, { encoding: 'utf-8' });
        const ast = resolveModuleImport(content);
        mod.ast = ast;
        events.emit('beforeModuleResolve', that.injectHelper({ mod }));

        for (const node of ast) {
          if (node.type !== 'import') {
            continue;
          }
          resolveAlias(alias, node);
          if (isBuiltin(node.pathname)) {
            continue;
          }

          let _pkgInfo = null;

          let isInnerImport = false;
          if ((isInnerImport = node.pathname.startsWith('#'))) {
            // subpath import from owen package
            // https://nodejs.org/api/packages.html#subpath-imports
            if (isInnerImport && pkgInfo) {
              let filepath = pkgInfo.imports[node.pathname];
              if (isObject(filepath)) {
                filepath = filepath[target];
              }
              const pathname = ensurePathPrefix(
                relative(cwd, join(pkgInfo.__root__, filepath))
              );
              node.setPathname(pathname);
            }
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
                dirname(_pkgInfo.__outpath__),
                node.pathname
              );
            }
          } else if (isPkg(node.pathname)) {
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

                // we use esmodule code by default
                mainFile =
                  _pkgInfo.module ||
                  (_exports && (_exports['.'] || _exports)) ||
                  _pkgInfo.main ||
                  'index.js';
              }
              node.absPath = join(_pkgInfo.__root__, mainFile);

              const absPath = guessFile(node.absPath, extensions);
              if (absPath !== node.absPath) {
                node.absPath = absPath;
                mainFile = ensurePathPrefix(
                  relative(_pkgInfo.__root__, node.absPath)
                );
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
                mainFile = ensurePathPrefix(
                  relative(_pkgInfo.__root__, node.absPath)
                );
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

            let relativePath = relative(cwd, pkgInfo ? pkgInfo.__root__ : root);
            if (pkgInfo) {
              relativePath = '../../' + relativePath;
              if (pkgInfo.name.startsWith('@')) {
                relativePath = '../' + relativePath;
              }
            }

            const outpath = join(
              '.pack',
              `${_pkgInfo.name}@${_pkgInfo.version || ''}`,
              `${mainFile}`
            );

            _pkgInfo.__outpath__ = outpath;

            node.setPathname(join(relativePath, outpath));
          }

          mod.dependencis.push(
            doResolve(node.absPath, mod, _pkgInfo || pkgInfo)
          );

          if (!watch) {
            const nodeMod = modules.get(node.absPath);
            if (nodeMod.hash) {
              const hashCode = nodeMod.hash.slice(0, HASH_LEN);
              const { pathname } = node;
              const ext = extname(pathname);
              node.setPathname(
                ext
                  ? pathname.replace(
                      new RegExp(`${ext}$`),
                      `_${hashCode}${ext}`
                    )
                  : `${pathname}_${hashCode}`
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
              loader.exclude.some((pattern) => pattern.test(mod._currentPath)))
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
      plugin(this.injectHelper({ events }, false), opts);
    }
  }

  /*
   * write to the disk
   */
  writeContent(modules) {
    const { output, events } = this;
    if (!modules) {
      modules = [...this.modules.values()];
    }
    modules = ensureArray(modules);

    if (!existsSync(output)) {
      mkdirSync(output, { recursive: true });
    }

    for (const mod of modules) {
      events.emit('beforeModuleWrite', this.injectHelper({ mod }));

      if (mod.noWrite) {
        continue;
      }

      const dest = join(output, mod.outpath);
      const dir = dirname(dest);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }

      if (mod.ast) {
        const code = genCodeFromAST(mod.ast);
        writeFileSync(dest, code);
      } else {
        copyFileSync(mod.id, dest);
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

        const added = [...addedModules.values()];

        this.applyLoaders([...new Set([...mod.dependencis, ...added])]);

        // root module need inject global code again
        if (mod === this.graph) {
          this.injectGlobalCode();
        }

        this.writeContent(added);

        // css via style-loader must write parent module again
        if (mod.type === 'inject-style') {
          this.writeContent(mod.parents);
        }

        changedFiles.delete(filename);
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
   * inject global runtime code
   * e.g. process.env.NODE_ENV
   */
  injectGlobalCode() {
    const { graph, modules } = this;

    const env = JSON.stringify({ ...extractEnv(['NODE_ENV']), ...this.define });
    const code = `${getGlobalThis.toString()}
const _global = getGlobalThis();
_global.process = { env: JSON.parse('${env}')};
`;
    const hashCode = hash(code).slice(0, HASH_LEN);

    const pathname = `./___pack_global___${hashCode}.js`;
    graph.ast.unshift(
      createASTNode('import', `import '${pathname}';\n`, { pathname })
    );

    const mod = createModule(pathname);
    modules.set(pathname, mod);
    mod.parents.push(graph);
    graph.dependencis.unshift(mod);
    mod.outpath = join(dirname(graph.outpath), pathname);

    mod.ast = [createASTNode('', code)];
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

class Module {
  constructor(id) {
    this.id = id;
    this.type = '';
    this._extensionChanged = false;
    this._currentPath = id;
    this.outpath = '';
    this.ast = null;
    this.noWrite = false;
    this.pkgInfo = null;
    this.hash = '';
    this.parents = [];
    this.dependencis = [];
  }

  reset() {
    for (const dep of this.dependencis) {
      removeItem(dep.parents, this);
    }

    this._extensionChanged = false;
    this._currentPath = this.id;
    this.ast = null;
    this.noWrite = false;
    this.hash = '';
    this.dependencis = [];
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

  walkParentASTNode(cb, checkAllNodes = false) {
    if (!this.parents.length) {
      return;
    }
    for (const parent of this.parents) {
      if (!parent.ast) {
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

export default (config) => Pack.pack(config);
