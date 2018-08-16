#!/usr/bin/env node

let app = require('commander')
let path = require('path')
let ipfsAPI = require('ipfs-api')
let chokidar = require('chokidar');
let chalk = require('chalk')

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
  .option('-w, --watch', 'Rebuild automatically when files change')

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

let compiler = new Compiler({
  ipfs: ipfs,
  subgraphManifest: file,
  outputDir: app.outputDir,
  outputFormat: app.outputFormat,
  verbosity: app.verbosity,
})

// Watch working directory for file updates or additions, trigger compile (if watch argument specified)
if (app.watch) {
  compiler.logger.info('')
  compiler.logger.info('%s %s', chalk.grey("Watching:"), compiler.options.subgraphManifest)

  // Initialize watcher
  let watcher = chokidar.watch(path.resolve(compiler.sourceDir, compiler.options.subgraphManifest), {
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

  let subgraph = compiler.loadSubgraph()

  compiler.logger.info(chalk.grey('Parse subgraph to setup ze watchers'))
  compiler.logger.info(chalk.grey('SUBGRAPH: ', subgraph))
  subgraph.getIn(['schema', 'file'], schemaFile => {
    compiler.logger.info(chalk.grey('Schemafile: ', schemaFile))
    let absoluteSourceFile = path.resolve(compiler.sourceDir, schemaFile)
    compiler.logger.info(chalk.grey('Starting to watch: ', absoluteSourceFile))
    watcher.add(absoluteSourceFile)
  })

  subgraph.get('dataSources', dataSources => {
    dataSources.map(dataSource =>
      dataSource
        .getIn(['mapping', 'file'], dataSourceFile => {
          let absoluteSourceFile = path.resolve(compiler.sourceDir, dataSourceFile)
          compiler.logger.info(chalk.grey('Starting to watch: ', absoluteSourceFile))
          watcher.add(absoluteSourceFile)
        })
        .getIn(['mapping', 'abis'], abis =>
          abis.map(abi =>
            abi.get('file', abiFile => {
              let absoluteSourceFile = path.resolve(compiler.sourceDir, abiFile)
              compiler.logger.info(chalk.grey('Starting to watch: ', absoluteSourceFile))
              watcher.add(absoluteSourceFile)
            })
          )
        )
    )
  })

  // Add event listeners.
  watcher
    .on('ready', function() {
      let files = watcher.getWatched()
      compiler.logger.info(chalk.grey('Files watched: ', files))
      compiler.compile()
      watcher
        .on('add', path => {
          compiler.logger.info(chalk.grey('New file detected: ', path))
          compiler.compile()
          compiler.logger.info('')
        })
        .on('change', path => {
          compiler.logger.info(chalk.grey('File change detected: ', path))
          compiler.compile()
          compiler.logger.info('')
      });
      compiler.logger.info('')
  })

  // Catch keyboard interrupt: close watcher and exit process
  process.on('SIGINT', function() {
    watcher.close()
    process.exit()
  })
} else {
  compiler.compile()
}
