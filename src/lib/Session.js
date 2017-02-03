const Config = require('./Config');
const fs = require('fs');
const mkdirp = require('mkdirp');
const pg = require('pg');
const url = require('url')
const unit = require('ethjs-unit');
const SOFA = require('sofa-js');

class Session {
  constructor(bot, pgPool, config, address, onReady) {
    this.bot = bot;
    this.config = config;
    this.pgPool = pgPool;

    if (!fs.existsSync(this.config.store)) {
      mkdirp.sync(this.config.store);
    }
    this.address = address;
    this.path = this.config.store+'/'+address+'.json';
    this.data = {
      address: this.address
    };
    this.thread = null;
    this.state = null;

    this.load(onReady);
  }

  get(key) {
    if (key === 'tokenId') {
      return this.address;
    }
    return this.data[key];
  }

  set(key, value) {
    this.data[key] = value;
    this.flush();
  }

  setState(name) {
    this.state = name;
    this.set('_state', name);
  }

  openThread(name) {
    this.closeThread();
    this.set('_thread', name)
    this.thread = this.bot.threads[name];
    this.thread.open(this);
  }

  closeThread() {
    if (this.thread) {
      this.thread.close(this);
    }
    this.thread = null;
    this.set('_thread', null);
    this.setState(null)
  }

  reset() {
    this.closeThread()
    this.setState(null)
    this.data = {
      address: this.address
    };
    this.flush();
  }

  reply(message) {
    this.bot.client.send(this.address, message);
  }

  sendEth(value, callback) {
    value = '0x' + unit.toWei(value, 'ether').toString(16)
    this.bot.client.rpc(this, {
      method: "sendTransaction",
      params: {
        to: this.get('paymentAddress'),
        value: value
      }
    }, (session, error, result) => {
      if (result) {
        session.reply(SOFA.Payment({
          status: "unconfirmed",
          value: value,
          txHash: result.txHash,
          fromAddress: this.config.address,
          toAddress: this.address
        }));
      }
      if (callback) { callback(session, error, result); }
    });
  }

  requestEth(value, message) {
    value = '0x' + unit.toWei(value, 'ether').toString(16)
    this.reply(SOFA.PaymentRequest({
      body: message,
      value: value,
      destinationAddress: this.config.paymentAddress
    }));
  }

  load(onReady) {
    this.execute('SELECT * from bot_sessions WHERE eth_address = $1', [this.address], (err, result) => {
      if (err) { console.log(err) }
      if (!err && result.rows.length > 0) {
        this.data = result.rows[0].data
        if (this.data._thread) {
          this.thread = this.bot.threads[this.data._thread];
        }
        if (this.data._state) {
          this.state = this.data._state;
        }
      } else {
        this.data = {
          address: this.address
        };
      }
      onReady()
    });
  }

  flush() {
    this.data.timestamp = Math.round(new Date().getTime()/1000);
    let query =  `INSERT INTO bot_sessions (eth_address, data)
                  VALUES ($1, $2)
                  ON CONFLICT (eth_address) DO UPDATE
                  SET data = $2`;
    this.execute(query, [this.address, this.data], (err, result) => {
      if (err) { console.log(err) }
    })
  }

  execute(query, args, cb) {
    this.pgPool.connect((err, client, done) => {
      if (err) { return cb(err) }
      client.query(query, args, (err, result) => {
        done(err);
        if (err) { return cb(err) }
        cb(null, result);
      })
    })
  }

  get json() {
    return JSON.stringify(this.data);
  }
}

module.exports = Session;
