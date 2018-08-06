#!/usr/bin/env node

let app = require('commander')
let path = require('path')
let ipfsAPI = require('ipfs-api')
let chokidar = require('chokidar');
const chalk = require('chalk')

let Compiler = require('./src/cli/compiler')

app
  .version('0.1.0')
  .arguments('<cmd> [file]')
  .option(
    '-o, --output-dir [path]',
    'Output directory for build artifacts',
    path.join(process.cwd(), 'dist')
  )
  .option(
    '--verbosity [info|verbose|debug]',
    'The log level to use (default: LOG_LEVEL or info)',
    process.env.LOG_LEVEL || 'info'
  )
  .option('-t, --output-format [format]', 'Output format (wasm, wast)', 'wasm')
  .option('i, --ipfs [addr]', 'IPFS node to use for uploading files')
  .option('-w, --watch', 'Setup directory watching to rebuild when file changes are detected')

app.on('--help', function() {
  console.log('')
  console.log('  IPFS:')
  console.log('')
  if (app.ipfs === null || app.ipfs === undefined) {
    console.log('    No IPFS node defined with -i/--ipfs')
  } else {
    console.log('    ${app.ipfs}')
  }
  console.log('')
})

app.parse(process.argv)

// Obtain the subgraph manifest file
let file = app.args.shift()
if (file === null || file === undefined) {
  app.help()
}

// Connect to the IPFS node (if a node address was provided)
let ipfs = app.ipfs ? ipfsAPI(app.ipfs) : undefined

let subgraph_generator = new Compiler({
  ipfs: ipfs,
  subgraphManifest: file,
  outputDir: app.outputDir,
  outputFormat: app.outputFormat,
  verbosity: app.verbosity,
})

// Watch working directory for file updates or additions, trigger compile (if watch argument specified)
if (app.watch) {
  subgraph_generator.logger.info('')
  subgraph_generator.logger.info('%s %s', chalk.grey("Watching:"), process.cwd())
  // Initialize watchers
  let watcher = chokidar.watch('.', {
    persistent: true,
    ignoreInitial: true,
    ignored: [
      './dist',
      './examples',
      './node_modules',
      /(^|[\/\\])\../
    ],
    depth: 3,
    atomic: 500
  })

  // Add event listeners.
  watcher
    .on('ready', function() {
      subgraph_generator.compile()
      watcher
        .on('add', path => {
          subgraph_generator.logger.info(chalk.grey('New file detected, rebuilding subgraph'))
          subgraph_generator.compile()
          subgraph_generator.logger.info('')
        })
        .on('change', path => {
          subgraph_generator.logger.info(chalk.grey('File change detected, rebuilding subgraph'))
          subgraph_generator.compile()
          subgraph_generator.logger.info('')
      });
      subgraph_generator.logger.info('')
  })

  //Catch keyboard interrupt: close watcher and exit process
  process.on('SIGINT', function() {
    watcher.close()
    process.exit()
  })
} else {
  subgraph_generator.compile()
}

