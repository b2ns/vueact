import { compile } from './compiler.js';
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync, watch } from 'fs';
import { basename, dirname, extname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { debounce, parseArgs } from './utils.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const r = (p) => resolve(__dirname, '..', p);

const args = parseArgs(process.argv.slice(2));
const src = args.files[0] ? r(args.files[0]) : '';
const output = args.output ? r(args.output) : '';
const isWatch = args.watch;

function build(src, output) {
  if (!src) return;

  if (output) {
    recursiveCopy(src, output);
  }

  doCompile(src, output);
  console.log('build done!');

  if (isWatch) {
    const watchHandler = debounce((event, filename) => {
      if (event !== 'change') {
        return;
      }
      const ext = extname(filename);
      if (ext === '.jsx') {
        doCompile(filename, output);
      } else if (ext === '.css') {
        doCompile(filename.replace(/\.css$/, '.jsx'), output);
      }
    });

    recursiveWatch(src, watchHandler);
  }
}

function doCompile(src, output) {
  if (statSync(src).isFile() && extname(src) === '.jsx') {
    compile(src, output);
    console.log(`compile ${src}`);
  } else {
    const dirs = readdirSync(src);
    for (let dir of dirs) {
      const file = join(src, dir);
      if (statSync(file).isDirectory()) {
        doCompile(file, join(output, dir));
      } else if (extname(file) === '.jsx') {
        compile(file, output);
        console.log(`compile ${file}`);
      }
    }
  }
}

function recursiveWatch(dir, handler) {
  watch(dir, (event, filename) => handler(event, join(dir, filename)));
  console.log(`watching ${dir} ...`);
  if (statSync(dir).isDirectory()) {
    const dirs = readdirSync(dir);
    for (let file of dirs) {
      file = join(dir, file);
      if (statSync(file).isDirectory()) {
        recursiveWatch(file, handler);
      }
    }
  }
}

function recursiveCopy(src, dist) {
  if (statSync(src).isDirectory()) {
    const dirs = readdirSync(src);
    for (let dir of dirs) {
      const file = join(src, dir);
      if (statSync(file).isDirectory()) {
        recursiveCopy(file, join(dist, dir));
      } else {
        doCopy(file, dist);
      }
    }
  } else {
    doCopy(src, dist);
  }
}

function doCopy(src, dist) {
  const ext = extname(src);
  if (['.jsx', '.css'].includes(ext)) {
    return;
  }
  if (!existsSync(dist)) {
    mkdirSync(dist);
  }
  copyFileSync(src, join(dist, basename(src)));
}

build(src, output);
