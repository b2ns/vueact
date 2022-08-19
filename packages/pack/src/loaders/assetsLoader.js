export default ({ mod }) => {
  mod.type === 'assets';
  mod.walkParentASTNode((node) => {
    const imported = node.imported[0];
    node.pathname = mod.outpath;
    node.code = `const ${imported.name} = '${node.pathname}';`;
  });
};
