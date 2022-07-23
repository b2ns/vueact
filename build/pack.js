import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, extname, join, relative, resolve } from 'path';
import {
  debounce,
  genCodeFromAST,
  isNpmModule,
  isRelative,
  log,
  normalizePathname,
  recursiveWatch,
  removeItem,
  resolveModuleImport,
  shouldResolveModule,
} from './utils.js';

export default function pack(config = {}) {
  let { root = './', entry = './src/main.js', output = './dist', resolve: resolveOpts, loaders, watch } = config;

  const projectRoot = resolve(root);
  const r = (p) => resolve(projectRoot, p);

  entry = r(entry);
  output = r(output);

  const importedModules = new Map();

  resolveDependencis(entry, importedModules, resolveOpts);

  applyLoader([...importedModules.values()], loaders);

  writeContent([...importedModules.values()], output, projectRoot);

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

      module = resolveDependencis(module.id, importedModules, resolveOpts);

      applyLoader(module, loaders);

      writeContent(module, output, projectRoot);
    });

    recursiveWatch(dirname(entry), handler);
  }
}

/*
 * resolve dependence graph
 */
function resolveDependencis(entry, cachedMap, resolveOpts) {
  const dependencis = doResolve(entry, null);

  function doResolve(absPath, parentModule) {
    const id = normalizePathname(absPath, resolveOpts && resolveOpts.extensions);

    const cached = cachedMap.get(id);
    if (cached) {
      cached.parents.push(parentModule);
      return cached;
    }

    const module = createModule(id);
    module.parents.push(parentModule);
    cachedMap.set(id, module);

    if (shouldResolveModule(module.id)) {
      const rootDir = dirname(id);
      const sourceCode = readFileSync(id, { encoding: 'utf-8' });
      const ast = resolveModuleImport(sourceCode, resolveOpts);
      module.ast = ast;

      for (const node of ast) {
        if (node.type !== 'import') {
          continue;
        }

        node.absPath = node.pathname;

        if (isRelative(node.absPath)) {
          node.absPath = join(rootDir, node.absPath);
        } else if (isNpmModule(node.absPath)) {
          // TODO: import from node_modules
        }

        module.dependencis.push(doResolve(node.absPath, module));
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

  doApply(Array.isArray(modules) ? modules : [modules]);

  function doApply(modules) {
    const extensionChangedModules = new Set();

    for (const module of modules) {
      for (const loader of loaders) {
        if (
          !loader.test ||
          !loader.test.test(module.currentPath) ||
          !loader.use ||
          !loader.use.length ||
          (loader.exclude && loader.exclude.some((pattern) => pattern.test(module.currentPath)))
        ) {
          continue;
        }

        const use = [...loader.use].reverse();
        for (let fn of use) {
          let opts = null;
          if (Array.isArray(fn)) {
            fn = fn[0];
            opts = fn[1];
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
  if (!Array.isArray(modules)) {
    modules = [modules];
  }

  if (!existsSync(output)) {
    mkdirSync(output);
  }

  for (const module of modules) {
    if (module.noWrite) {
      continue;
    }

    const dest = join(output, relative(projectRoot, module.currentPath));
    const dir = dirname(dest);
    if (!existsSync(dir)) {
      mkdirSync(dir);
    }

    if (module.ast) {
      const code = genCodeFromAST(module.ast);
      writeFileSync(dest, code, { encoding: 'utf-8' });
    } else {
      copyFileSync(module.currentPath, dest);
    }
  }
}
