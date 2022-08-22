import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createASTNode, hash, removeItem, get__dirname } from './utils.js';

const __dirname = get__dirname(import.meta.url);
const moduleWrapperCode = readFileSync(
  join(__dirname, './client/moduleWrapper.js'),
  'utf-8'
);

export class Chunk {
  constructor(id, outpath, appendHash = false) {
    this.id = id;
    this._modules = [];
    this.__outpath = outpath || id;
    this._outpath = '';
    this._content = null;
    this.appendHash = appendHash;
  }

  get size() {
    return this._modules.length;
  }

  get outpath() {
    if (this._outpath) {
      return this._outpath;
    }

    let outpath = '';
    if (this.appendHash) {
      const hashCode = hash(this.content);
      outpath = this.__outpath.replace(/\.(\w+)$/, `_${hashCode}.$1`);
      for (const mod of this._modules) {
        mod.walkParentASTNode((node) => {
          node.setPathname(
            node.pathname.replace(/\.(\w+)$/, `_${hashCode}.$1`)
          );
        });
      }
    } else {
      outpath = this.__outpath;
    }

    return (this._outpath = outpath);
  }

  get content() {
    if (this._content !== null) {
      return this._content;
    }

    let content = '';
    for (const mod of this._modules) {
      if (mod.type === 'assets') {
        continue;
      }
      content += mod.content;
    }

    return (this._content = content);
  }

  add(mod) {
    this._modules.unshift(mod);
  }
}

let pkgChunkId = 0;
export class PkgChunk extends Chunk {
  constructor(appendHash) {
    const id = `/.pack/pkg_chunk${pkgChunkId}.js`;
    super(id, id, appendHash);
    this.__requireName = `__pkgRequire${pkgChunkId}__`;
    pkgChunkId++;
  }

  static pkgChunkMap = new Map();

  static transformParent(mod, pkgChunk, outpath) {
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
        const requireCode = `${pkgChunk.__requireName}('${mod.uid}');`;
        if (importVars) {
          code += `const {${importVars}} = ${requireCode}`;
        } else {
          code += `${requireCode}`;
        }

        removeItem(ast, node, createASTNode('', code));

        if (!ast[pkgChunk.__requireName]) {
          ast.unshift(
            createASTNode(
              '',
              `import ${pkgChunk.__requireName} from '${outpath}';\n`
            )
          );
          ast[pkgChunk.__requireName] = true;
        }
      },
      (parent) => !parent.isPkg
    );
  }

  get outpath() {
    if (this._outpath) {
      return this._outpath;
    }

    let outpath = '';
    if (this.appendHash) {
      const hashCode = hash(this.content);
      outpath = this.__outpath.replace(/\.(\w+)$/, `_${hashCode}.$1`);
    } else {
      outpath = this.__outpath;
    }

    for (const mod of this._modules) {
      PkgChunk.transformParent(mod, this, outpath);
    }

    return (this._outpath = outpath);
  }

  get content() {
    if (this._content) {
      return this._content;
    }

    let content = '';
    const loadedPkgChunk = new Set();

    const pkgModules = [];
    const handled = new Set();
    const doBundle = (mod) => {
      if (handled.has(mod.id)) {
        return;
      }
      handled.add(mod.id);

      if (PkgChunk.pkgChunkMap.has(mod.id)) {
        const loaded = PkgChunk.pkgChunkMap.get(mod.id);
        loadedPkgChunk.add(loaded);
        mod.walkParentASTNode(
          (node) => {
            node.setPathname(mod.uid);
            node.code = node.code.replace('require', loaded.__requireName);
          },
          (parent) => parent.isPkg
        );
        return;
      }

      mod.walkParentASTNode(
        (node) => {
          node.setPathname(mod.uid);
        },
        (parent) => parent.isPkg
      );

      pkgModules.push(mod);

      for (const dep of mod.dependencis) {
        doBundle(dep);
      }
    };

    for (const mod of this._modules) {
      doBundle(mod);
    }

    let pkgModuleCode = '';
    for (const mod of pkgModules) {
      pkgModuleCode += `'${mod.uid}': (exports, module, require) => {\n${mod.content}\n},\n`;

      PkgChunk.pkgChunkMap.set(mod.id, this);
    }

    let importLoadedPkgCode = '';
    for (const chunk of loadedPkgChunk) {
      importLoadedPkgCode += `import ${chunk.__requireName} from '${chunk.outpath}';\n`;
    }

    content =
      importLoadedPkgCode +
      'const __modules__ = {\n' +
      pkgModuleCode +
      '};\n' +
      moduleWrapperCode;

    return (this._content = content);
  }
}

export class Chunks {
  constructor() {
    this._chunks = [];
  }

  get root() {
    return this._chunks[this._chunks.length - 1];
  }

  add(chunk) {
    this._chunks.unshift(chunk);
  }

  *[Symbol.iterator]() {
    for (const chunk of this._chunks) {
      yield chunk;
    }
  }
}

export function splitChunks(moduleRoot, { addedModules, appendHash = false }) {
  const chunks = new Chunks();
  let pkgChunk = null;

  const handled = new Set();
  doSplit(moduleRoot);

  function doSplit(mod) {
    if (handled.has(mod.id)) {
      return;
    }
    handled.add(mod.id);
    const isAdded = !addedModules || addedModules.has(mod.id);

    if (!isAdded) {
      if (mod.isPkgScript) {
        const loadedPkgChunk = PkgChunk.pkgChunkMap.get(mod.id);
        PkgChunk.transformParent(mod, loadedPkgChunk, loadedPkgChunk.outpath);
      }
      return;
    }

    if (mod.isPkgScript) {
      if (!pkgChunk) {
        pkgChunk = new PkgChunk(appendHash);
      }
      pkgChunk.add(mod);
    } else {
      if (!mod.noWrite) {
        const chunk = new Chunk(mod.id, mod.outpath, appendHash);
        chunk.add(mod);
        chunks.add(chunk);
      }
    }

    if (!mod.isPkg) {
      for (const dep of mod.dependencis) {
        doSplit(dep);
      }
    }
  }

  pkgChunk && chunks.add(pkgChunk);

  // trigger the outpath getter
  for (const chunk of chunks) {
    chunk.outpath;
  }

  return chunks;
}
