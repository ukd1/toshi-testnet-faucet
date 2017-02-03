const wrap = require('word-wrap');
const chalk = require('chalk');
chalk.enabled = true;

function mapLines(s, f) {
  if (s == null) { s = "null" }
  return s.split('\n').map(f)
}

class Logger {

  static sentMessage(sofa) {
    Logger.log(Logger.colorPrefix('\u21D0          ', wrap(sofa.string, {width: 60, cut: true}), chalk.green, chalk.grey));
    Logger.log(Logger.color('\u21D0          ', sofa.display, chalk.green));
    Logger.log('\n');
  }

  static receivedMessage(sofa) {
    Logger.log(Logger.colorPrefix('\u21D2  ', wrap(sofa.string, {width: 60, cut: true}), chalk.yellow, chalk.grey));
    Logger.log(Logger.color('\u21D2  ', sofa.display, chalk.yellow));
    Logger.log('\n');
  }

  static color(prefix, message, color) {
    let lines = mapLines(message, (x) => { return color(prefix + x) });
    return lines.join('\n');
  }

  static colorPrefix(prefix, message, color, color2) {
    let lines = mapLines(message, (x) => { return color(prefix) + color2(x) });
    return lines.join('\n');
  }

  static log(o) {
    console.log(o);
  }

}

module.exports = Logger;
