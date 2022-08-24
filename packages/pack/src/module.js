import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, extname, isAbsolute, join, relative } from 'node:path';
import {
  changeExtension,
  ensurePathPrefix,
  genCodeFromAST,
  getPkgInfo,
  guessFile,
  hash,
  isBuiltin,
  isObject,
  isRelative,
  removeItem,
  resolveAlias,
  resolveModuleImport,
  shouldResolveModule,
} from './utils.js';
const require = createRequire(import.meta.url);

let moduleId = 0;
export class Module {
  constructor(id) {
    this.uid = moduleId++;
    this.id = id;
    this.type = '';
    this.extension = extname(id);
    this._extensionChanged = false;
    this._currentPath = id;
    this.outpath = '';
    this.ast = null;
    this.raw = '';
    this.noWrite = false;
    this.pkgInfo = null;
    this.hash = '';
    this.parents = [];
    this.dependencis = [];
    this.isRoot = false;
    this.injectedHMR = false;
    this.changing = true;
    this.isCJS = false;
  }

  get isPkg() {
    return Boolean(this.pkgInfo);
  }

  get isPkgScript() {
    return this.pkgInfo && this.type === 'script';
  }

  get content() {
    if (this.ast) {
      return genCodeFromAST(this.ast);
    }
    return this.raw;
  }

  reset() {
    this.clearDeps();

    this._extensionChanged = false;
    this._currentPath = this.id;
    this.outpath = '';
    this.ast = null;
    this.raw = '';
    this.noWrite = false;
    this.hash = '';
    this.injectedHMR = false;
    this.changing = true;
    this.isCJS = false;
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

  walkParentASTNode(cb, parentFilter, nodeFilter) {
    let { parents } = this;
    if (parentFilter) {
      parents = parents.filter(parentFilter);
    }
    if (!parents.length) {
      return;
    }

    nodeFilter = nodeFilter || ((node) => node.absPath === this.id);

    for (const parent of parents) {
      if (!parent.changing) {
        continue;
      }
      for (const node of parent.ast.filter(nodeFilter)) {
        cb(node, parent.ast);
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

  addParent(parent) {
    parent && this.parents.push(parent);
  }

  deleteParent(parent) {
    parent && removeItem(this.parents, parent);
  }

  clearParents() {
    for (const parent of this.parents) {
      parent.deleteDep(this);
    }
    this.parents = [];
  }

  addDep(dep) {
    dep && this.dependencis.push(dep);
  }

  deleteDep(dep) {
    dep && removeItem(this.dependencis, dep);
  }

  clearDeps() {
    for (const dep of this.dependencis) {
      dep.deleteParent(this);
    }
    this.dependencis = [];
  }

  clear() {
    this.clearParents();
    this.clearDeps();
  }
}

export function createModule(id) {
  return new Module(id);
}

export class ModuleGraph {
  constructor() {
    this._root = null;
    this._modules = new Map();
    this._resolvedPkg = new Map();
  }

  get root() {
    return this._root;
  }

  set root(mod) {
    this._root = mod;
    mod && (mod.root = true);
  }

  get modules() {
    return [...this._modules.values()];
  }

  addModule(mod) {
    this._modules.set(mod.id, mod);
  }

  deleteModule(id) {
    return this._modules.delete(id);
  }

  getModule(id) {
    return this._modules.get(id);
  }

  hasModule(id) {
    return this._modules.has(id);
  }

  clearModule(id) {
    const mod = this.getModule(id);
    if (mod) {
      this.deleteModule(id);
      mod.clear();
    }
    return mod;
  }

  resolve(entry, { emit, root, resolveOpts, target, extra }) {
    const { _resolvedPkg: resolvedPkg } = this;
    const { extensions, alias } = resolveOpts;

    const doResolve = (pathOrMod, parentModule, pkgInfo) => {
      let mod = null;
      let id = '';
      if (isObject(pathOrMod)) {
        mod = pathOrMod;
        id = pathOrMod.id;
      } else {
        id = pathOrMod;
      }

      const cached = this.getModule(id);
      if (cached) {
        cached.addParent(parentModule);
        return cached;
      }

      if (!mod) {
        mod = createModule(id);
      }
      this.addModule(mod);
      mod.addParent(parentModule);

      const raw = readFileSync(id);
      mod.pkgInfo = mod.pkgInfo || pkgInfo;
      if (mod.pkgInfo) {
        mod.outpath = mod.pkgInfo.__outpath__;
      } else {
        mod.outpath = relative(root, id);
        mod.hash = hash(raw);
      }

      if (extra.addedModules) {
        extra.addedModules.set(id, mod);
      }

      emit('moduleCreated', { mod });

      if (shouldResolveModule(id)) {
        mod.type = 'script';
        const cwd = dirname(id);

        mod.raw = raw.toString();
        emit('beforeModuleResolve', { mod });
        const { ast, isCJS } = resolveModuleImport(mod.raw);
        mod.ast = ast;
        mod.isCJS = isCJS;
        mod.raw = '';

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
            node.setPathname(
              ensurePathPrefix(relative(cwd, join(pkgInfo.__root__, filepath)))
            );
          }

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
          } else {
            let pkgCacheKey = node.pathname;
            if (pkgInfo) {
              pkgCacheKey = `${pkgInfo.name}@${pkgInfo.version}/${pkgCacheKey}`;
            }
            if (resolvedPkg.has(pkgCacheKey)) {
              const cached = resolvedPkg.get(pkgCacheKey);
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
              };

              const trySubPath = () => {
                resolvedPath = require.resolve(node.pathname, {
                  paths: [cwd],
                });
                _pkgInfo = getPkgInfo(resolvedPath);
                node.absPath = resolvedPath;
                mainFile = relative(_pkgInfo.__root__, resolvedPath);
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

              const absPath = guessFile(node.absPath, extensions);
              if (absPath !== node.absPath) {
                node.absPath = absPath;
                mainFile = relative(_pkgInfo.__root__, absPath);
              }

              const outpath = join(
                '/.pack',
                `${_pkgInfo.name}@${_pkgInfo.version || ''}`,
                `${mainFile}`
              );

              _pkgInfo.__outpath__ = outpath;

              node.setPathname(outpath);

              resolvedPkg.set(pkgCacheKey, {
                absPath: node.absPath,
                pkgInfo: { ..._pkgInfo },
              });
            }
          }

          mod.addDep(doResolve(node.absPath, mod, _pkgInfo));
        }

        emit('moduleResolved', { mod });
      }

      return mod;
    };

    const res = doResolve(entry);

    if (extra.setRoot) {
      this.root = res;
    }

    return res;
  }
}
