import { removeItem } from '../utils.js';

export default ({ mod }) => {
  mod.walkParentASTNode((node, ast) => {
    removeItem(ast, node);
  });
};
