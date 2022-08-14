import { parse } from '../jsxParser.js';

export default ({ mod }, opts) => {
  const { ast } = mod;
  mod.changeExtension('.jsx.js');

  if (mod.changing) {
    for (const node of ast) {
      if (node.type === 'other') {
        node.rawCode = parse(node.rawCode, opts);
      }
    }
  }
};
