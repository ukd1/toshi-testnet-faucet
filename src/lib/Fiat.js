var rp = require('request-promise-native');
const endpoint = 'https://api.coinbase.com/v2/exchange-rates?currency=ETH'

const CACHE_AGE_LIMIT = 5 * 60 * 1000 // 5 minutes
let rates = {}
let helpers = {}
let cachedAt = 0

function getRates() {
  console.log("Fiat: Fetching rates")
  return rp(endpoint)
    .then((body) => {
      cachedAt = new Date().getTime()

      let freshRates = JSON.parse(body).data.rates
      for (let k in freshRates) {
        rates[k] = freshRates[k]
      }
      generateHelpers()
      return helpers
    })
    .catch((error) => {
      console.log("Fiat fetch error: " + error)
    })
}

function generateHelpers() {
  for (let [code, rate] of Object.entries(rates)) {
    (function(code,rate) {
      helpers[code] = function(fiat) {
        if (fiat) {
          return fiat / rates[code]
        } else {
          return rates[code]
        }
      }
    })(code,rate)
  }
}

function fetch(limit=CACHE_AGE_LIMIT) {
  let now = new Date().getTime()
  if (now - cachedAt > limit) {
    return getRates()
  } else {
    console.log("Fiat: Using cached rates")
    return Promise.resolve(helpers)
  }
}

getRates()
  .then((helper) => {
    console.log("Fiat: Rates initialized successfully")
  })

module.exports = { fetch: fetch, rates: rates }
