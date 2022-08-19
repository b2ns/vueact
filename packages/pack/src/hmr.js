import { ensurePathPrefix } from './utils.js';

export function hmrUpdate(updateModules, app) {
  if (!updateModules || !updateModules.length) {
    return;
  }

  const updates = [];

  for (const mod of updateModules) {
    if (mod.type === 'style') {
      updates.push({ type: 'style', id: mod.id, content: mod.raw });
    } else if (mod.type === 'script' || mod.extension === '.json') {
      const outpath = ensurePathPrefix(mod.outpath) + `?hash=${mod.hash}`;
      updates.push({
        type: 'js',
        id: mod.id,
        isSelfUpdate: true,
        outpath,
      });

      propagateUpdate(mod);
    }
  }

  function propagateUpdate(mod) {
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
        rawPathname: parent.ast.find(({ absPath }) => absPath === mod.id)
          .rawPathname,
        outpath,
      });

      propagateUpdate(parent);
    }
  }

  if (updates.length) {
    app.send({ type: 'update', updates });
  } else {
    app.send({ type: 'reload' });
  }
}
