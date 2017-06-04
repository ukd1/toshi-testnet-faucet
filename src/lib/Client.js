const redis = require('redis');
const SOFA = require('sofa-js');
const Config = require('./Config');
const Session = require('./Session');
const Logger = require('./Logger');
const EthService = require('./EthService');
const IdService = require('./IdService');
const Storage = require('./Storage');

const JSONRPC_VERSION = '2.0';
const JSONRPC_REQUEST_CHANNEL = '_rpc_request';
const JSONRPC_RESPONSE_CHANNEL = '_rpc_response';

class Client {
  constructor(bot) {
    this.bot = bot;
    this.rpcCalls = {};
    this.nextRpcId = 0;

    this.config = new Config(process.argv[2]);

    Logger.info("TOKEN ID: " + this.config.tokenIdAddress);
    Logger.info("PAYMENT ADDRESS KEY: " + this.config.paymentAddress);

    if (this.config.storage.postgres) {
      this.store = new Storage.PSQLStore(this.config.storage.postgres);
    } else if (this.config.storage.sqlite) {
      this.store = new Storage.SqliteStore(this.config.storage.sqlite);
    }

    let redisConfig = {
      host: this.config.redis.host,
      port: this.config.redis.port,
      password: this.config.redis.password
    }

    this.subscriber = redis.createClient(redisConfig);
    this.rpcSubscriber = redis.createClient(redisConfig);
    this.publisher = redis.createClient(redisConfig);

    this.subscriber.on("error", function (err) {
        Logger.error("Error " + err);
    });
    this.rpcSubscriber.on("error", function (err) {
        Logger.error("Error " + err);
    });
    this.publisher.on("error", function (err) {
        Logger.error("Error " + err);
    });

    this.subscriber.on("message", (channel, message) => {
      try {
        let wrapped = JSON.parse(message);
        if (wrapped.recipient == this.config.tokenIdAddress) {
          let session = new Session(this.bot, this.store, this.config, wrapped.sender, () => {
            let sofa = SOFA.parse(wrapped.sofa);
            if (sofa.type != 'Payment') {
              Logger.receivedMessage(sofa, session.user);
            } else {
              Logger.debug("Ignoring 'SOFA:Payment' message from chat message: expecting Ethereum Service Notification soon");
            }

            if (sofa.type == "Init") {
              for(let k in sofa.content) {
                session.set(k, sofa.content[k]);
              }
              let held = session.get('heldForInit')
              if (held) {
                session.set('heldForInit', null)
                let heldSofa = SOFA.parse(held);
                this.bot.onClientMessage(session, heldSofa);
              }
            } else if (sofa.type == "InitRequest") {
              // send through so bot authors have the option
              // to allow their bot to talk to other bots
              this.bot.onClientMessage(session, sofa);
            } else {
              if (!session.get('paymentAddress')) {
                Logger.info('User has not sent Init message, sending InitRequest');
                // since we don't register payment messages from untrusted
                // sources, make sure we don't send it after an init either
                if (sofa.type != 'Payment') {
                  session.set('heldForInit', wrapped.sofa);
                }
                session.reply(SOFA.InitRequest({
                  values: ['paymentAddress', 'language']
                }));
              } else if (sofa.type != 'Payment') { // Only forward non payment types
                this.bot.onClientMessage(session, sofa);
              }
            }

          });
        }
      } catch(e) {
        Logger.error("On Message Error: " + e);
      }
    });
    this.subscriber.subscribe(this.config.tokenIdAddress);

    this.rpcSubscriber.on("message", (channel, message) => {
      try {
        message = JSON.parse(message);
        if (message.jsonrpc == JSONRPC_VERSION) {
          let stored = this.rpcCalls[message.id];
          delete this.rpcCalls[message.id];
          let session = new Session(this.bot, this.store, this.config, stored.sessionAddress, () => {
            stored.callback(session, message.error, message.result);
          });
        }
      } catch(e) {
        Logger.error("On RPC Message Error: "+e);
      }
    });
    this.rpcSubscriber.subscribe(this.config.tokenIdAddress+JSONRPC_RESPONSE_CHANNEL);

    this.eth = new EthService(this.config.identityKey);

    // poll headless client for ready state
    // note: without this, if the eth service returns notifications before
    // the headless client is ready, the responses generated can be lost
    // in the redis void
    var interval = setInterval(() => {
      this.rpc({address: this.config.tokenIdAddress}, {
        method: "ping"
      }, (session, error, result) => {
        if (result) {
          clearInterval(interval);
          Logger.info("Headless client ready...");
          this.configureServices();
        }
      });
    }, 1000);

  }

  configureServices() {
    // eth service monitoring
    this.store.getKey('lastTransactionTimestamp').then((last_timestamp) => {
      this.eth.subscribe(this.config.paymentAddress, (raw_sofa) => {
        let sofa = SOFA.parse(raw_sofa);
        let fut;
        let direction;
        if (sofa.fromAddress == this.config.paymentAddress) {
          // updating a payment sent from the bot
          fut = IdService.paymentAddressReverseLookup(sofa.toAddress);
          direction = "out";
        } else if (sofa.toAddress == this.config.paymentAddress) {
          // updating a payment sent to the bot
          fut = IdService.paymentAddressReverseLookup(sofa.fromAddress);
          direction = "in"
        } else {
          // this isn't actually interesting to us
          Logger.debug('got payment update for which neither the to or from address match ours!');
          return;
        }
        fut.then((sender) => {
          // TODO: handle null session better?
          if (!sender) sender = {};
          Logger.receivedPaymentUpdate(sofa, sender, direction);
          let session = new Session(this.bot, this.store, this.config, sender.token_id, () => {
            // first check if the session has a valid user (i.e. it's not from an external source)
            if (session.user.token_id && !session.get('paymentAddress')) {
              session.set('heldForInit', raw_sofa);
              session.reply(SOFA.InitRequest({
                values: ['paymentAddress', 'language']
              }));
            } else {
              this.bot.onClientMessage(session, sofa);
            }
          });
        }).catch((err) => {
          Logger.error(err);
        });

        this.store.setKey('lastTransactionTimestamp', this.eth.get_last_message_timestamp(this.config.paymentAddress));
      }, last_timestamp);
    }).catch((err) => {
      Logger.error(err);
    });
  }

  send(address, message) {
    if (typeof message === "string") {
      message = SOFA.Message({body: message})
    }
    Logger.sentMessage(message, address);
    this.publisher.publish(this.config.tokenIdAddress, JSON.stringify({
      sofa: message.string,
      sender: this.config.tokenIdAddress,
      recipient: address
    }));
  }

  rpc(session, rpcCall, callback) {
    rpcCall.id = this.getRpcId();
    this.rpcCalls[rpcCall.id] = {sessionAddress: session.address, callback: callback};
    this.publisher.publish(this.config.tokenIdAddress+JSONRPC_REQUEST_CHANNEL, JSON.stringify(rpcCall));
  }

  getRpcId() {
    let id = this.nextRpcId;
    this.nextRpcId += 1;
    return id.toString();
  }
}

module.exports = Client;
