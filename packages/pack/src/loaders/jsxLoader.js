import { parse } from '../jsxParser.js';

export default ({ mod }, opts) => {
  const { ast } = mod;
  mod.changeExtension('.jsx.js');

  for (const node of ast) {
    if (node.type === 'other') {
      node.rawCode = parse(node.rawCode, opts);
    }
  }
};
