var rp = require('request-promise-native');
const WebSocket = require('ws');
const Logger = require('./Logger');
const SOFA = require('sofa-js');
const numberToBN = require('number-to-bn');

function getUrl(path, proto) {
  var endpoint;
  if (!proto) proto = 'https';
  if (process.env['STAGE'] == 'development') {
    endpoint = proto + '://token-eth-service-development.herokuapp.com';
  } else {
    endpoint = proto + '://token-eth-service.herokuapp.com';
  }
  return endpoint + path;
}

function getLocalTimestamp() {
  return parseInt(new Date().getTime() / 1000);
}

class WebsocketClient {
  constructor(signing_key) {
    this.signing_key = signing_key;
    this.ws = null;
    this.subscriptions = {};
    this.last_timestamp = 0;
    this.jsonrpc_id = 0;
    this._wscalls = {};
  }

  connect() {
    if (this.ws) {
      try {
        this.ws.ping();
        // if this is fine the connection is already open
      } catch (e) {
        // otherwise we need to open another connection
        this.ws.terminate();
        this.ws = null;
        this._connected = false;
      }
    }
    let timestamp = getLocalTimestamp();
    // don't spam connections when reconnecting fails
    if (timestamp - this._last_connect_timestamp < 5) {
      setTimeout(this.connect.bind(this), (5 - (timestamp - this._last_connect_timestamp)) * 1000);
      return;
    } else {
      this._last_connect_timestamp = timestamp;
    }
    let data =
        "GET" + "\n" +
        "/v1/ws" + "\n" +
        timestamp + "\n";
    let sig = this.signing_key.sign(data);
    this.ws = new WebSocket(getUrl('/v1/ws', 'wss'), [], {
      headers: {
        'Token-ID-Address': this.signing_key.address,
        'Token-Timestamp': timestamp,
        'Token-Signature': sig
      }
    });
    this.ws.on('open', this.subscribe.bind(this));
    this.ws.on('message', this.handle_message.bind(this));
    this.ws.on('close', this.handle_close.bind(this));
    this.ws.on('error', this.handle_error.bind(this));
  }

  call_list_payment_updates(address, start, end) {
    if (!start) {
      start = this.subscriptions[address].last_timestamp;
      if (!start) {
        // no stored value here, so refusing to call
        // otherwise we would get the entire transaction
        // history
        return;
      }
    }
    if (!end) {
      end = getLocalTimestamp();
    }
    var jsonrpcid = this.jsonrpc_id = this.jsonrpc_id + 1;
    var message = {
      "jsonrpc": "2.0",
      "id": this.jsonrpc_id,
      "method": "list_payment_updates",
      "params": [address, start, end]
    };
    this.ws.send(JSON.stringify(message));
    this._wscalls[jsonrpcid] = message;
  }

  subscribe(address, callback, last_timestamp) {
    if (address) {
      if (!callback) {
        throw Exception("Expected callback passed to subscibe");
      }
      if (!(address in this.subscriptions)) {
        this.subscriptions[address] = {last_timestamp: last_timestamp, callbacks: []};
        if (this._connected) {
          var jsonrpcid = this.jsonrpc_id = this.jsonrpc_id + 1;
          var message = JSON.stringify({
            "jsonrpc": "2.0",
            "id": this.jsonrpc_id,
            "method": "subscribe",
            "params": address
          });
          this.ws.send(message);
          this.call_list_payment_updates(address);
        }
      }
      if (this.subscriptions[address].callbacks.indexOf(callback) == -1) {
        this.subscriptions[address].callbacks.push(callback);
      }
    } else {
      this._connected = true;
      // reconnecting, resubscribe to all!
      var jsonrpcid = this.jsonrpc_id = this.jsonrpc_id + 1;
      var message = JSON.stringify({
        "jsonrpc": "2.0",
        "id": this.jsonrpc_id,
        "method": "subscribe",
        "params": Object.keys(this.subscriptions)
      });
      this.ws.send(message);
      for (address in this.subscriptions) {
        this.call_list_payment_updates(address);
      }
    }
  }

  handle_message(message) {
    message = JSON.parse(message);
    if (message['method']) {
      if (message['method'] == 'subscription') {
        let address = message['params']['subscription'];
        if (address in this.subscriptions) {
          this.subscriptions[address].last_timestamp = getLocalTimestamp();
          for (var i = 0; i < this.subscriptions[address].callbacks.length; i++) {
            let cb = this.subscriptions[address].callbacks[i];
            cb(message['params']['message']);
          }
        }
      }
    } else if ('error' in message) {
      Logger.error(`Message Error (${message['error']['code']}): ${message['error']['message']}`);
    } else if ('id' in message) {
      let caller = this._wscalls[message['id']];
      if (caller) {
        let address = caller['params'][0];
        this.subscriptions[address].last_timestamp = Math.max(caller['params'][2], this.subscriptions[address].last_timestamp);
        for (var m of message['result']) {
          for (var i = 0; i < this.subscriptions[address].callbacks.length; i++) {
            let cb = this.subscriptions[address].callbacks[i];
            cb(m);
          }
        }
        delete this._wscalls[message['id']];
      }
    }
  }

  handle_close() {
    this.maybe_reconnect();
  }

  handle_error(e) {
    // captures unexpected errors that the websocket library
    // cannot handle gracefully (e.g. websocket server going down)
    Logger.error("Websocket Error");
    this.maybe_reconnect();
  }

  maybe_reconnect() {
    this._connected = false;
    // only try reconnect if there is a `this.ws` otherwise we get in a look
    if (this.ws) {
      let oldws = this.ws;
      this.ws = null;
      oldws.terminate();
      this.connect();
    }
  }
}

class EthService {
  static getBalance(address) {
    return rp(getUrl('/v1/balance/' + address))
      .then((body) => {
        return numberToBN(JSON.parse(body).unconfirmed_balance);
      })
      .catch((error) => {
        Logger.error("Error getting balance for '" + address + "': " + error);
      });
  }

  static getTransaction(hash) {
    return rp(getUrl('/v1/tx/' + hash))
      .then((body) => {
        body = JSON.parse(body);
        body.gasPrice = numberToBN(body.gasPrice);
        body.gas = numberToBN(body.gas);
        body.nonce = numberToBN(body.nonce);
        body.value = numberToBN(body.value);
        if (body.blockNumber) { body.blockNumber = numberToBN(body.blockNumber); }
        return body;
      })
      .catch((error) => {
        Logger.error("Unable to get transaction with hash: '" + hash + "': " + error);
      });
  }

  constructor(signing_key) {
    this.signing_key = signing_key;
    this.ws = null;
  }

  subscribe(address, callback, last_message_timestamp) {
    if (!this.ws) {
      this.ws = new WebsocketClient(this.signing_key);
      this.ws.connect();
    }
    this.ws.subscribe(address, callback, last_message_timestamp);
  }

  get_last_message_timestamp(address) {
    if (this.ws) {
      if (this.ws.subscriptions[address]) {
        return this.ws.subscriptions[address].last_timestamp;
      }
    }
    return null;
  }
}



module.exports = EthService;
