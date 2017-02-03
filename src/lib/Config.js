const url = require('url');
const fs = require('fs');
const yaml = require('js-yaml');

class Config {
  constructor(path) {
    let config = yaml.safeLoad(fs.readFileSync(path, 'utf8'));
    for(let k in config) this[k]=config[k];

    if (this.postgres.url) { this.postgresUrl = this.postgres.url; }
    if (this.postgres.envKey) { this.postgresUrl = process.env[this.postgres.envKey]; }
    if (this.redis.uri) { this.redisUrl = this.redis.uri; }
    if (this.redis.envKey) { this.redisUrl = process.env[this.redis.envKey]; }
    if (!this.address) { this.address = process.env['TOKEN_APP_ID'] }
    if (!this.paymentAddress) { this.paymentAddress = process.env['TOKEN_APP_PAYMENT_ADDRESS'] }
  }

  set postgresUrl(s) {
    this.postgres = {url: s};
    /*
    let url = url.parse(s);
    this.username = dbUri.getUserInfo().split(":")[0];
    this.password = dbUri.getUserInfo().split(":")[1];
    this.jdbcUrl = "jdbc:postgresql://" + dbUri.getHost() + ':' + dbUri.getPort() + dbUri.getPath();
    */
  }

  set redisUrl(s) {
    let uri = url.parse(s);
    if (uri.protocol && uri.protocol == 'redis:') {
      this.redis.host = uri.hostname;
      this.redis.port = uri.port;
      if (uri.auth && uri.auth.indexOf(':') > -1) {
        this.redis.password = uri.auth.split(':')[1];
      }
    }
  }
}

module.exports = Config;
