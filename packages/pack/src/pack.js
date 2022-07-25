import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'fs';
import { dirname, extname, join, relative, resolve } from 'path';
import {
  debounce,
  ensureArray,
  genCodeFromAST,
  isPkg,
  isRelative,
  log,
  normalizePathname,
  recursiveWatch,
  removeItem,
  resolveModuleImport,
  shouldResolveModule,
} from './utils.js';

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

  const projectRoot = resolve(root);
  const r = (p) => resolve(projectRoot, p);

  entry = r(entry);
  output = r(output);

  const importedModules = new Map();

  resolveDependencis(entry, projectRoot, importedModules, resolveOpts);

  applyLoader([...importedModules.values()], loaders);

  writeContent([...importedModules.values()], output, projectRoot);

  runPlugins(plugins);

  log('build done');

  /*
   * watch
   */
  if (watch) {
    log('watching ...');

    for (const module of importedModules.values()) {
      // free some memory
      resetModule(module);
    }

    const handler = debounce((event, filename) => {
      if (event !== 'change') {
        return;
      }

      let module = importedModules.get(filename);

      if (!module) return;

      log(`changing: ${filename}`);

      removeModule(module, importedModules);

      module = resolveDependencis(
        module.id,
        projectRoot,
        importedModules,
        resolveOpts
      );

      applyLoader(module, loaders);

      writeContent(module, output, projectRoot);
    });

    recursiveWatch(dirname(entry), handler);
  }
}

/*
 * resolve dependence graph
 */
function resolveDependencis(entry, projectRoot, cachedMap, resolveOpts) {
  const dependencis = doResolve(entry, null, '', projectRoot);

  function doResolve(absPath, parentModule, pkg, pkgRoot) {
    const id = normalizePathname(
      absPath,
      resolveOpts && resolveOpts.extensions
    );

    const cached = cachedMap.get(pkg || id);
    if (cached) {
      cached.parents.push(parentModule);
      return cached;
    }

    const module = createModule(id);
    cachedMap.set(pkg || id, module);
    module.pkg = pkg ? pkg : parentModule && parentModule.pkg;
    parentModule && module.parents.push(parentModule);

    if (shouldResolveModule(module.id)) {
      const cwd = dirname(id);
      const sourceCode = readFileSync(id, { encoding: 'utf-8' });
      const ast = resolveModuleImport(sourceCode, resolveOpts);
      module.ast = ast;

      for (const node of ast) {
        if (node.type !== 'import') {
          continue;
        }

        let rawPkg = '';
        let _pkgRoot = pkgRoot;

        node.absPath = node.pathname;

        if (isRelative(node.pathname)) {
          node.absPath = join(cwd, node.pathname);
        } else if (isPkg(node.pathname)) {
          rawPkg = node.pathname;

          let pkgName = rawPkg;
          // looking for index.js as main entry in package
          let entry = 'index.js';

          // if starts with '@', means it's a scoped package
          const isScoped = pkgName.startsWith('@');
          const segments = pkgName.split('/');
          const cuttingIndex = isScoped ? 2 : 1;

          // import specific file
          // e.g. import xxx from '@vueact/shared/src/xxx.js'
          if (segments.length > cuttingIndex) {
            pkgName = segments.slice(0, cuttingIndex).join('/');
            entry = segments(cuttingIndex).join('/');
          }

          _pkgRoot = join(pkgRoot, 'node_modules', pkgName);
          node.absPath = join(_pkgRoot, entry);

          // change ast pathname and code
          // vueact -> /relative/path/to/vueact/index.js
          let relativePath = relative(cwd, node.absPath);

          // nested package
          if (cwd.includes('node_modules')) {
            // flaten the structure, put all node package at the top level
            relativePath = '../' + relativePath.replace(/node_modules\//g, '');
            if (module.pkg.startsWith('@')) {
              relativePath = '../' + relativePath;
            }
          }

          node.pathname = relativePath;
          node.code = node.code.replace(rawPkg, relativePath);
        }

        module.dependencis.push(
          doResolve(node.absPath, module, rawPkg, _pkgRoot)
        );
      }
    }

    return module;
  }

  return dependencis;
}

function createModule(id) {
  const module = {
    id,
    extensionChanged: false,
    currentPath: id,
    ast: null,
    noWrite: false,
    pkg: '',
    parents: [],
    dependencis: [],
  };
  return module;
}

function resetModule(module) {
  Object.assign(module, createModule(module.id));
}

function removeModule(module, cachedMap) {
  cachedMap.delete(module.id);
  for (const dep of module.dependencis) {
    removeItem(dep.parents, module);
  }
  for (const parent of module.parents) {
    removeItem(parent.dependencis, module);
  }
}

/*
 * apply loader on each imported module
 */
function applyLoader(modules, loaders) {
  if (!loaders || !loaders.length) {
    return;
  }

  modules = ensureArray(modules);

  doApply(modules);

  function doApply(modules) {
    const extensionChangedModules = new Set();

    for (const module of modules) {
      for (const loader of loaders) {
        if (
          !loader.test ||
          !loader.test.test(module.currentPath) ||
          !loader.use ||
          !loader.use.length ||
          (loader.exclude &&
            loader.exclude.some((pattern) => pattern.test(module.currentPath)))
        ) {
          continue;
        }

        const use = [...loader.use].reverse();
        for (let fn of use) {
          let opts = null;
          if (Array.isArray(fn)) {
            opts = fn[1];
            fn = fn[0];
          }
          fn(
            {
              absPath: module.id,
              ast: module.ast,
              parents: module.parents,
              changeExtension: (ext) => changeExtension(module, ext),
              noWrite: () => noWrite(module),
            },
            opts
          );
        }
        if (module.extensionChanged) {
          extensionChangedModules.add(module);
          module.extensionChanged = false;
        }
      }
    }

    if (extensionChangedModules.size) {
      doApply([...extensionChangedModules.values()]);
    }
  }
}

function changeExtension(module, ext) {
  if (!ext) {
    return;
  }
  if (!ext.startsWith('.')) {
    ext = `.${ext}`;
  }
  const currentExt = extname(module.currentPath);
  if (currentExt === ext) {
    return;
  }

  module.extensionChanged = true;
  module.currentPath = module.currentPath.replace(currentExt, ext);
}

function noWrite(module) {
  module.noWrite = true;
}

/*
 * write to the disk
 */
function writeContent(modules, output, projectRoot) {
  modules = ensureArray(modules);

  if (!existsSync(output)) {
    mkdirSync(output, { recursive: true });
  }

  for (const module of modules) {
    if (module.noWrite) {
      continue;
    }

    let { currentPath } = module;
    // flatten the package in node_modules
    // and put all package at the same directory: __pack__
    if (currentPath.includes('node_modules')) {
      currentPath = currentPath.replace(
        /node_modules.+node_modules/g,
        'node_modules'
      );
    }
    const dest = join(output, relative(projectRoot, currentPath));
    const dir = dirname(dest);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    if (module.ast) {
      const code = genCodeFromAST(module.ast);
      writeFileSync(dest, code, { encoding: 'utf-8' });
    } else {
      copyFileSync(module.currentPath, dest);
    }
  }
}

function runPlugins(plugins) {
  if (!plugins || !plugins.length) {
    return;
  }

  for (let plugin of plugins) {
    let opts = null;
    if (Array.isArray(plugin)) {
      opts = plugin[1];
      plugin = plugin[0];
    }
    plugin(null, opts);
  }
}
