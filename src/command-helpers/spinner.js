const chalk = require('chalk')
const immutable = require('immutable')
const toolbox = require('gluegun/toolbox')

const step = (spinner, subject, text) => {
  if (text) {
    spinner.stopAndPersist({
      text: toolbox.print.colors.muted(`${subject} ${text}`),
    })
  } else {
    spinner.stopAndPersist({ text: toolbox.print.colors.muted(subject) })
  }
  spinner.start()
  return spinner
}

const withSpinner = async (text, errorText, warningText, f) => {
  let spinner = toolbox.print.spin(text)
  try {
    let result = await f(spinner)
    if(warningText && immutable.Map.isMap(result)) {
      if (result.get('warning', false)) {
        spinner.stopAndPersist({symbol: '⚠️', text: `${warningText}: ${result.get('warning')}`})
        return result.get('value')
      } else {
        spinner.succeed(text)
        return result.get('value', result)
      }
    } else {
      spinner.succeed(text)
      return result
    }
  } catch (e) {
    spinner.fail(`${errorText}: ${e.message}`)
    throw e
  }
}

module.exports = {
  step,
  withSpinner
}
