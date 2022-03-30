import envPlugin from '@chialab/esbuild-plugin-env';
import htmlPlugin from '@chialab/esbuild-plugin-html';
import esbuild from 'esbuild';
import sassPlugin from 'esbuild-plugin-sass';
import { copyFile } from 'fs/promises';
import path from 'path';

const __dirname = path.resolve();
const isProd = process.env.NODE_ENV === 'production';
const PORT = Number(process.env.PORT || 9000);
const DIST_DIRNAME = process.env.OUTDIR || 'dist';
const SRC_DIRNAME = process.env.SRCDIR || 'src';
const SRC_FILENAME = process.env.ENTRYPOINT || 'index.html';
const VERBOSE = !!process.env.VERBOSE || false;
const PLATFORM = process.env.PLATFORM || 'browser';
const TARGET = process.env.TARGET || 'esnext';
const DIST = path.join(__dirname, DIST_DIRNAME);
const newEntrypointFilename = path.join(DIST_DIRNAME, SRC_FILENAME);

/** @type {esbuild.ServeOptions}} */
const OPTIONS_SERVE = {
  port: PORT,
  servedir: DIST
};

/** @type {{ [ext: string]: esbuild.Loader }} */
const LOADERS = {
  '.ts': 'ts',
  '.tsx': 'tsx',
  '.png': 'file',
  '.svg': 'file'
};

/** @type {esbuild.BuildOptions} */
const OPTIONS_BUILD = {
  entryPoints: [path.join(SRC_DIRNAME, SRC_FILENAME)],
  assetNames: isProd ? undefined : '[name]',
  bundle: true,
  loader: LOADERS,
  metafile: true,
  minify: isProd,
  outdir: DIST,
  platform: PLATFORM === 'node' ? 'node' : 'browser',
  plugins: [envPlugin(), htmlPlugin(), sassPlugin()],
  sourcemap: isProd ? false : 'inline',
  target: TARGET
};

/**
 * @param {number} size
 * @returns {string}
 */
function humanFileSize(size) {
  const scale = Math.floor(Math.log(size) / Math.log(1024));
  const rounded = size / Math.pow(1024, scale);

  return rounded.toFixed(2) + ['b', 'kb', 'mb', 'gb', 'tb'][scale];
}

/**
 * @param {[string, esbuild.Metafile['outputs'][string]][]} outputTuples
 * @returns {[string, esbuild.Metafile['outputs'][string]] | undefined}
 */
function findIndexOutputTuple(outputTuples) {
  const searchPath = path.join(DIST_DIRNAME, SRC_FILENAME.split('.')[0] + '.*'); // should be dist/index.*
  const indexRegexp = new RegExp(searchPath);
  const foundEntry = outputTuples.find(([f]) => indexRegexp.test(f));

  return foundEntry;
}

/**
 * @param {esbuild.Metafile} metafile
 * @returns {string}
 */
function analyzeMetafile(metafile) {
  const outputEntries = Object.entries(metafile.outputs);

  let totalSize = 0;

  let outputTxt = outputEntries.reduce((txt, [fileName, meta]) => {
    txt = `${txt}\n${fileName}: ${humanFileSize(meta.bytes)}`;
    totalSize += meta.bytes;
    return txt;
  }, '');

  outputTxt = `${outputTxt}\n\nTotal Bundle Size: ${humanFileSize(totalSize)}`;

  return outputTxt;
}

async function runDev() {
  const { host, port } = await esbuild.serve(OPTIONS_SERVE, OPTIONS_BUILD);

  console.log(`Dev Build Running:\n\tServeDir:  ${DIST}\n\tDevServer: ${host}:${port}`);
}

async function runProd() {
  const buildResults = await esbuild.build(OPTIONS_BUILD);

  console.log(`Prod Build Complete:\n\tBuildDir:  ${DIST_DIRNAME}`);

  if (!buildResults.metafile) {
    return;
  }

  const outputTuples = Object.entries(buildResults.metafile.outputs);
  const foundEntry = findIndexOutputTuple(outputTuples);

  if (!foundEntry) {
    throw new Error('Could not find a suitable Entrypoint file!');
  }

  console.log(`\tEntrypoint Copy: ${foundEntry[0]} -> ${newEntrypointFilename}`);
  await copyFile(foundEntry[0], newEntrypointFilename);

  if (VERBOSE) {
    console.log(analyzeMetafile(buildResults.metafile));
  }
}

const whichRunMode = isProd ? runProd : runDev;

whichRunMode().catch(console.error);
