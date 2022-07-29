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
  extractEnv,
  genCodeFromAST,
  getGlobalThis,
  getPkgInfo,
  guessExtension,
  isFunction,
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

let projectRoot = '';
const r = (p) => resolve(projectRoot, p);

export default function pack(config = {}) {
  let {
    root = './',
    entry = './src/main.js',
    output = './dist',
    resolve: resolveOpts,
    loaders,
    plugins,
    watch,
  } = config;

  projectRoot = resolve(root);

  entry = r(entry);
  output = r(output);

  const importedModules = new Map();

  const events = new EventEmitter();

  applyPlugins(plugins, events);

  events.emit('start', injectHelper({ modules: importedModules }));

  const dependencis = resolveDependencis(
    entry,
    importedModules,
    resolveOpts,
    events
  );

  applyLoader([...importedModules.values()], loaders, events);

  injectGlobalCode(dependencis, importedModules);

  writeContent([...importedModules.values()], output, events);

  events.emit('end', injectHelper({ modules: importedModules, dependencis }));

  log('build done');

  // TODO: cant not work now
  /*
   * watch
   */
  if (watch) {
    log('watching ...');

    for (const mod of importedModules.values()) {
      // free some memory
      resetModule(mod);
    }

    const handler = debounce((event, filename) => {
      if (event !== 'change') {
        return;
      }

      let mod = importedModules.get(filename);

      if (!mod) return;

      log(`changing: ${filename}`);

      removeModule(mod, importedModules);

      mod = resolveDependencis(mod.id, importedModules, resolveOpts);

      applyLoader(mod, loaders);

      writeContent(mod, output);
    });

    recursiveWatch(dirname(entry), handler);
  }
}

/*
 * resolve dependence graph
 */
function resolveDependencis(entry, cachedMap, resolveOpts, events) {
  const dependencis = doResolve(entry, null, null);

  function doResolve(absPath, parentModule, pkgInfo) {
    const id = guessExtension(absPath, resolveOpts && resolveOpts.extensions);

    const cached = cachedMap.get(id);
    if (cached) {
      cached.parents.push(parentModule);
      return cached;
    }

    const mod = createModule(id);

    cachedMap.set(id, mod);

    parentModule && mod.parents.push(parentModule);

    mod.pkgInfo = pkgInfo;
    if (pkgInfo) {
      mod.outpath = pkgInfo.__outpath__;
    } else {
      mod.outpath = relative(projectRoot, id);
    }

    events.emit('moduleCreated', injectHelper({ module: mod }));

    if (shouldResolveModule(mod.id)) {
      const cwd = dirname(id);
      const sourceCode = readFileSync(id, { encoding: 'utf-8' });
      const ast = resolveModuleImport(sourceCode, resolveOpts);
      mod.ast = ast;
      events.emit('beforeModuleResolve', injectHelper({ module: mod }));

      for (const node of ast) {
        if (node.type !== 'import') {
          continue;
        }

        let _pkgInfo = null;

        node.absPath = node.pathname;

        if (isRelative(node.pathname)) {
          node.absPath = join(cwd, node.pathname);
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
          // import from subdirectory
          // e.g. import xxx from '@vueact/shared/src/xxx.js'
          if (segments.length > cuttingIndex) {
            pkgName = segments.slice(0, cuttingIndex).join('/');
            mainFile = segments.slice(cuttingIndex).join('/');
          }

          const resolvedPath = require.resolve(pkgName, {
            paths: [cwd],
          });
          _pkgInfo = getPkgInfo(resolvedPath);

          if (!mainFile) {
            // we use esmodule code by default
            mainFile = _pkgInfo.module || _pkgInfo.main || 'index.js';
          }
          node.absPath = join(_pkgInfo.__root__, mainFile);

          let relativePath = relative(
            cwd,
            pkgInfo ? pkgInfo.__root__ : projectRoot
          );
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

        mod.dependencis.push(doResolve(node.absPath, mod, _pkgInfo || pkgInfo));
      }

      events.emit('moduleResolved', injectHelper({ module: mod }));
    }

    return mod;
  }

  return dependencis;
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

function resetModule(mod) {
  const initMod = createModule(mod.id);
  for (const key in initMod) {
    const val = initMod[key];
    if (!isFunction(val)) {
      mod[key] = val;
    }
  }
}

function removeModule(mod, cachedMap) {
  cachedMap.delete(mod.id);
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

/*
 * apply loader on each imported module
 */
function applyLoader(modules, loaders, events) {
  if (!loaders || !loaders.length) {
    return;
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
 * write to the disk
 */
function writeContent(modules, output, events) {
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

function applyPlugins(plugins, events) {
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

function injectGlobalCode(root, cachedMap) {
  const pathname = './___.pack_global___.js';
  root.ast.unshift(
    createASTNode('import', `import '${pathname}';\n`, { pathname })
  );

  const mod = createModule(pathname);
  cachedMap.set(pathname, mod);
  mod.parents.push(root);
  root.dependencis.unshift(mod);
  mod.outpath = join(dirname(root.outpath), pathname);

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
