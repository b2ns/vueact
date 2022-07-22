import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, extname, isAbsolute, join, relative, resolve } from 'path';
import { fileURLToPath } from 'url';
import { inNodeModules, isRelative, normalizePathname, resolveImportModules } from './utils.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const r = (p) => resolve(__dirname, '..', p);

export default function pack({entry, output, resolve: resolveOpts, loaders }) {
  const importedModules = new Map();

  function resolveDependencis() {
    function doResolve(absPath, rawPath) {
      const id = normalizePathname(absPath, resolveOpts && resolveOpts.extensions);

      const cached = importedModules.get(id);
      if (cached) {
        return cached;
      }

      const module = {
        id,
        rawPath,
        extensionChanged: false,
        currentPath: id,
        content: '',
        dependencis: [],
      };
      importedModules.set(id, module);

      const sourceCode = readFileSync(id, { encoding: 'utf-8' });
      const modules = resolveImportModules(sourceCode, resolveOpts);
      if (modules.length) {
        const rootDir = dirname(id);
        for (const rawPath of modules) {
          let absPath = rawPath;
          if (isRelative(absPath)) {
            absPath = join(rootDir, absPath);
          } else if (inNodeModules(absPath)) {
            // TODO: import from node_modules
          }

          module.dependencis.push(doResolve(absPath, rawPath));
        }
      }

      return module;
    }

    return doResolve(r(entry), entry);
  }

  function applyLoader() {
    function doApply(modules) {
      const extensionChangedModules = new Set();

      for (const module of modules) {
        if (!module.content) {
          module.content = readFileSync(module.id, { encoding: 'utf-8' });
        }

        if (!loaders || !loaders.length) {
          continue;
        }

        for (const loader of loaders) {
          if (loader.test.test(module.currentPath) && loader.use && loader.use.length) {
            const use = [...loader.use].reverse();
            for (let fn of use) {
              const opts = null;
              if (Array.isArray(fn)) {
                fn = fn[0];
                opts = fn[1];
              }
              module.content = fn(module.content, opts, {
                changeExtension: (ext) => changeExtension(module, ext),
              });
            }
            if (module.extensionChanged) {
              extensionChangedModules.add(module);
              module.extensionChanged = false;
            }
          }
        }
      }

      if (extensionChangedModules.size) {
        doApply(extensionChangedModules.values());
      }
    }

    doApply(importedModules.values());
  }

  function changeExtension(module, ext) {
    if (!ext) {
      return;
    }
    if (!ext.startsWith('.')) {
      ext = `.${ext}`;
    }
    module.extensionChanged = true;
    module.currentPath = module.currentPath.replace(extname(module.currentPath), ext);
  }

  function writeToOutput() {
    const root = r('.');
    const dist = r(output);
    if (!existsSync(dist)) {
      mkdirSync(dist);
    }

    for (const module of importedModules.values()) {
      const pathname = join(dist, relative(root, module.currentPath));
      const dir = dirname(pathname);
      if (!existsSync(dir)) {
        mkdirSync(dir);
      }
      writeFileSync(pathname, module.content, { encoding: 'utf-8' });
    }
  }

  resolveDependencis();

  applyLoader();

  writeToOutput();
}
