import EventEmitter from 'events';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'fs';
import { createRequire } from 'module';
import { dirname, extname, join, relative, resolve } from 'path';
import {
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
  normalizeExtension,
  recursiveWatch,
  removeItem,
  resolveModuleImport,
  shouldResolveModule,
} from './utils.js';

const require = createRequire(import.meta.url);

class Pack {
  constructor({
    root = './',
    entry = './src/main.js',
    output = './dist',
    resolve: resolveOpts,
    loaders,
    plugins,
    watch,
    target = 'default', // default(web), node
  }) {
    this.root = resolve(root);
    this.entry = resolve(this.root, entry);
    this.output = resolve(this.root, output);
    this.resolveOpts = resolveOpts;
    this.loaders = loaders;
    this.plugins = plugins;
    this.watch = watch;
    this.target = target;

    this.importedModules = new Map();
    this.graph = null;
    this.events = new EventEmitter();
  }

  static pack(config) {
    new Pack(config).run();
  }

  run() {
    const { importedModules, graph } = this;
    this.applyPlugins();

    this.events.emit('start', injectHelper({ modules: importedModules }));

    this.graph = this.resolveDependencis();

    this.applyLoaders();

    this.injectGlobalCode();

    this.writeContent();

    this.events.emit('end', injectHelper({ modules: importedModules, graph }));

    log('build done');

    if (this.watch) {
      this.doWatch();
    }
  }

  /*
   * resolve dependence graph
   */
  resolveDependencis(entry, extra = {}) {
    if (!entry) {
      entry = this.entry;
    }
    const { importedModules, events, root, resolveOpts, target } = this;
    const extensions = resolveOpts && resolveOpts.extensions;

    const graph = doResolve(entry, null, null);

    function doResolve(absPath, parentModule, pkgInfo) {
      const id = absPath;

      const cached = importedModules.get(id);
      if (cached) {
        cached.parents.push(parentModule);
        return cached;
      }

      const mod = createModule(id);

      importedModules.set(id, mod);

      parentModule && mod.parents.push(parentModule);

      mod.pkgInfo = pkgInfo;
      if (pkgInfo) {
        mod.outpath = pkgInfo.__outpath__;
      } else {
        mod.outpath = relative(root, id);
      }

      events.emit('moduleCreated', injectHelper({ module: mod }));

      if (shouldResolveModule(mod.id)) {
        const cwd = dirname(id);
        const sourceCode =
          extra.content || readFileSync(id, { encoding: 'utf-8' });
        const ast = resolveModuleImport(sourceCode, resolveOpts);
        mod.ast = ast;
        mod.hash = pkgInfo ? '' : extra.hash || hash(sourceCode);
        events.emit('beforeModuleResolve', injectHelper({ module: mod }));

        for (const node of ast) {
          if (node.type !== 'import' || isBuiltin(node.pathname)) {
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

          if (isRelative(node.pathname)) {
            node.absPath = join(cwd, node.pathname);

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

          // ensure all extension change to '.js'
          // App -> App.js
          // App.jsx -> App.js
          normalizeExtension(node);

          mod.dependencis.push(
            doResolve(node.absPath, mod, _pkgInfo || pkgInfo)
          );
        }

        events.emit('moduleResolved', injectHelper({ module: mod }));
      }

      return mod;
    }

    return graph;
  }

  /*
   * apply loader on each imported module
   */
  applyLoaders(modules) {
    const { loaders, events } = this;
    if (!loaders || !loaders.length) {
      return;
    }

    if (!modules) {
      modules = [...this.importedModules.values()];
    }
    modules = ensureArray(modules);

    doApply(modules);

    function doApply(modules) {
      const extensionChangedModules = new Set();

      for (const mod of modules) {
        for (const loader of loaders) {
          if (
            !loader.test ||
            !loader.test.test(mod.currentPath) ||
            !loader.use ||
            !loader.use.length ||
            (loader.exclude &&
              loader.exclude.some((pattern) => pattern.test(mod.currentPath)))
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
            fn(injectHelper({ module: mod, events }), opts);
          }
          if (mod.extensionChanged) {
            extensionChangedModules.add(mod);
            mod.extensionChanged = false;
          }
        }
      }

      if (extensionChangedModules.size) {
        doApply([...extensionChangedModules.values()]);
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
      plugin(injectHelper({ events }), opts);
    }
  }

  /*
   * write to the disk
   */
  writeContent(modules) {
    const { output, events } = this;
    if (!modules) {
      modules = [...this.importedModules.values()];
    }
    modules = ensureArray(modules);

    if (!existsSync(output)) {
      mkdirSync(output, { recursive: true });
    }

    for (const mod of modules) {
      events.emit('beforeModuleWrite', injectHelper({ module: mod }));

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
        writeFileSync(dest, code, { encoding: 'utf-8' });
      } else {
        copyFileSync(mod.currentPath, dest);
      }

      events.emit('moduleWrited', injectHelper({ module: mod }));
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
        const mod = this.importedModules.get(filename);

        if (!mod) return;

        const content = readFileSync(filename, { encoding: 'utf-8' });
        const newHash = hash(content);
        if (mod.hash === newHash) {
          return;
        }

        log(`changing: ${filename}`);

        removeModule(mod, this.importedModules);

        const newMod = this.resolveDependencis(mod.id, {
          content,
          hash: newHash,
        });
        // fix parents reference
        newMod.parents = mod.parents;
        for (const parent of mod.parents) {
          parent.dependencis.push(newMod);
        }

        this.applyLoaders(newMod);

        this.writeContent(newMod);

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
    const { graph, importedModules } = this;

    const pathname = './___.pack_global___.js';
    graph.ast.unshift(
      createASTNode('import', `import '${pathname}';\n`, { pathname })
    );

    const mod = createModule(pathname);
    importedModules.set(pathname, mod);
    mod.parents.push(graph);
    graph.dependencis.unshift(mod);
    mod.outpath = join(dirname(graph.outpath), pathname);

    const env = JSON.stringify(extractEnv(['NODE_ENV']));
    mod.ast = [
      createASTNode(
        'other',
        `${getGlobalThis.toString()}
const _global = getGlobalThis();
_global.process = { env: JSON.parse('${env}')};
`
      ),
    ];
  }
}

function createModule(id) {
  const mod = {
    id,
    extensionChanged: false,
    currentPath: id,
    outpath: '',
    ast: null,
    noWrite: false,
    pkgInfo: null,
    hash: '',
    parents: [],
    dependencis: [],
    changeExtension(ext) {
      if (!ext) {
        return;
      }
      if (!ext.startsWith('.')) {
        ext = `.${ext}`;
      }
      const currentExt = extname(mod.currentPath);
      if (currentExt === ext) {
        return;
      }

      mod.extensionChanged = true;
      mod.currentPath = mod.currentPath.replace(currentExt, ext);
      mod.outpath = mod.outpath.replace(currentExt, ext);
    },
    skipWrite() {
      mod.noWrite = true;
    },
  };
  return mod;
}

function removeModule(mod, importedModules) {
  importedModules.delete(mod.id);
  for (const dep of mod.dependencis) {
    removeItem(dep.parents, mod);
  }
  for (const parent of mod.parents) {
    removeItem(parent.dependencis, mod);
  }
}

function injectHelper(obj) {
  return {
    ...obj,
    createASTNode,
  };
}

export default (config) => Pack.pack(config);
