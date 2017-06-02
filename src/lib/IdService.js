const fetch = require('./ServiceClient');

function getUrl(path, proto) {
  var endpoint;
  if (!proto) proto = 'https';
  if (process.env['STAGE'] == 'development') {
    endpoint = proto + '://token-id-service-development.herokuapp.com';
  } else {
    endpoint = proto + '://token-id-service.herokuapp.com';
  }
  return endpoint + path;
}

let cached_users = {
};
let cached_users_pa = {
};

function cache_is_valid(timestamp, timeout) {
  timeout = timeout || 3600;
  return timestamp - (new Date().getTime() / 1000) > timeout;
}

class IdService {
  constructor(signing_key) {
    this.signing_key = signing_key;
  }

  static getUser(token_id) {
    if (cached_users[token_id] && cache_is_valid(cached_users[token_id].timestamp)) {
      return Promise.resolve(cached_users[token_id].user);
    }
    return fetch({
      url: getUrl('/v1/user/' + token_id),
      json: true
    }).then((user) => {
      cached_users[token_id] = {timestamp: new Date().getTime() / 1000, user: user};
      if (user.payment_address) {
        cached_users_pa[user.payment_address] = cached_users_pa[token_id];
      }
      return user;
    }).catch((err) => {
      return null;
    });
  }

  static paymentAddressReverseLookup(address) {
    if (cached_users_pa[address] && cache_is_valid(cached_users_pa[address].timestamp)) {
      return Promise.resolve(cached_users_pa[address].user);
    }
    return fetch({
      url: getUrl('/v1/search/user?payment_address=' + address),
      json: true
    }).then((body) => {
      cached_users_pa[address] = {timestamp: new Date().getTime() / 1000, user: null};
      let user = null;
      if (body.results.length > 0) {
        user = body.results[0];
        cached_users_pa[address].user = user
        cached_users[user.token_id] = cached_users_pa[address];
      }
      return user;
    });
  }
}

module.exports = IdService;
