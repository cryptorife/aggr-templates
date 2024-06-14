const fs = require('fs')
const markets = require('./markets.json')
// const template_chart = require("./template_chart.json")
const template_full = require("./template_full.json")
const template_tape = require("./template_tape.json")

const templates = {
  // chart: template_chart,
  full: template_full,
  tape: template_tape
}

const colors = {
  'BINANCE': 'rgb(255,152,0)',
  'BINANCE-FUTURES': 'rgba(255,205,81,0.75)',
  // 'BITFINEX': 'rgba(8,153,129,0.75)', BTFINEX source is fugged needs fix TODO
  'BYBIT': 'rgb(255,235,59)',
  'COINBASE': 'rgba(41,98,255,0.75)',
  'DERIBIT': 'rgba(112,204,189,0.75)',
  'OKX': 'rgba(93,96,107,0.75)'
}

const cvdExchangeIndicator = (name, script) => ({
  "id": `cvd-exchange-${name}`,
  "libraryId": `cvd-exchange-${name}`,
  "name": `cvd-exchange-${name}`,
  "script": script,
  "createdAt": 1716531496274,
  "updatedAt": 1716531534751,
  "options": {
    "priceScaleId": `cvd-exchange-${name}`,
    "scaleMargins": {
      "top": 0.74,
      "bottom": 0.03
    },
    "color": colors[name],
    "visible": true
  },
  "optionsDefinitions": {},
  "series": [
    "cvd-exchange"
  ],
  "displayName": `CVD Exchange ${name}`,
  "unsavedChanges": false
})

const baseQuoteLookupKnown = new RegExp(
    `^([A-Z0-9]{3,})[-/:]?(USDT|USDC|TUSD|BUSD)$|^([A-Z0-9]{2,})[-/:]?(UST|EUR|USD)$`
  )

const baseQuoteLookupOthers = new RegExp(`^([A-Z0-9]{2,})[-/]?([A-Z0-9]{3,})$`)
// const baseQuoteLookupPoloniex = new RegExp(`^(.*)_(.*)$`)

function getMarketProduct(exchangeId, symbol, noStable) {
    const id = exchangeId + ':' + symbol
  
    let type = 'spot'
  
    if (/[UZ_-]\d{2}/.test(symbol)) {
      type = 'future'
    } else if (exchangeId === 'BINANCE_FUTURES' || exchangeId === 'DYDX') {
      type = 'perp'
    } else if (exchangeId === 'BITFINEX' && /F0$/.test(symbol)) {
      // type = 'perp'
      type = 'future' // changed to future to avoid it, as it is not parsing it well
    } else if (exchangeId === 'HUOBI' && /_(CW|CQ|NW|NQ)$/.test(symbol)) {
      type = 'future'
    } else if (exchangeId === 'HUOBI' && /-/.test(symbol)) {
      type = 'perp'
    } else if (exchangeId === 'BYBIT' && !/-SPOT$/.test(symbol)) {
      type = 'perp'
    } else if (
      exchangeId === 'BITMEX' ||
      /(-|_)swap$|(-|_|:)perp/i.test(symbol)
    ) {
      if (/\d{2}/.test(symbol)) {
        type = 'future'
      } else {
        type = 'perp'
      }
    } else if (exchangeId === 'PHEMEX' && symbol[0] !== 's') {
      type = 'perp'
    } else if (exchangeId === 'KRAKEN' && /_/.test(symbol) && type === 'spot') {
      type = 'perp'
    }
  
    let localSymbol = symbol
  
    if (exchangeId === 'BYBIT') {
      localSymbol = localSymbol.replace(/-SPOT$/, '')
    } else if (exchangeId === 'KRAKEN') {
      localSymbol = localSymbol.replace(/PI_/, '').replace(/FI_/, '')
    } else if (exchangeId === 'BITFINEX') {
      localSymbol = localSymbol
        .replace(/(.*)F0:(\w+)F0/, '$1-$2')
        .replace(/UST($|F0)/, 'USDT$1')
    } else if (exchangeId === 'HUOBI') {
      localSymbol = localSymbol.replace(/_CW|_CQ|_NW|_NQ/i, 'USD')
    } else if (exchangeId === 'DERIBIT') {
      localSymbol = localSymbol.replace(/_(\w+)-PERPETUAL/i, '$1')
    }
  
    localSymbol = localSymbol
      .replace(/xbt$|^xbt/i, 'BTC')
      .replace(/-PERP(ETUAL)?/i, '-USD')
      .replace(/[^a-z0-9](perp|swap|perpetual)$/i, '')
      .replace(/[^a-z0-9]\d+$/i, '')
      .toUpperCase()
  
    let localSymbolAlpha = localSymbol.replace(/[-_/:]/, '')
  
    let match = localSymbol.match(baseQuoteLookupKnown)
    if (!match) {
      match = localSymbolAlpha.match(baseQuoteLookupOthers)
    }
  
    if (
      !match &&
      (exchangeId === 'DERIBIT' || exchangeId === 'HUOBI')
    ) {
      match = localSymbolAlpha.match(/(\w+)[^a-z0-9]/i)
  
      if (match) {
        match[2] = match[1]
      }
    }
  
    let base
    let quote
  
    if (match) {
      if (match[1] === undefined && match[2] === undefined) {
        base = match[3]
        quote = match[4]
      } else {
        base = match[1]
        quote = match[2]
      }
  
      if (noStable) {
        localSymbolAlpha = stripStable(base + quote)
      } else {
        localSymbolAlpha = base + quote
      }
    }
  
    return {
      id,
      base,
      quote,
      pair: symbol,
      local: localSymbolAlpha,
      exchange: exchangeId,
      type
    }
  }


// expects symbol e.g. 'BINANCE:BTUCSDT'
const getCvd = (symbols, title) => {
  const vbuy = symbols.join(".vbuy+") + ".vbuy";
  const vsell = symbols.join(".vsell+") + ".vsell";
  return `_vbuy=(${vbuy})\n_vsell=(${vsell})\nline(cum(_vbuy-_vsell), title=${title})`
}

function getTemplate(template, type, symbol, markets, spotFlatMarkets, perpFlatMarkets) {
  const title = `Rife${symbol} ${type}`;
  const id = `rife${symbol}${type}_v` + Date.now()
  template.name = title;
  template.id = id + Date.now()
  if (type !== 'tape') {
    template.states.panes.panes.chart.markets = markets;
    template.states.panes.panes.chart2.markets = markets;
  }
  if (type !== 'chart') {
    template.states.panes.panes.stats.markets = perpFlatMarkets
    template.states.panes.panes.stats2.markets = spotFlatMarkets
    template.states.panes.panes.trades.markets = perpFlatMarkets
    template.states.panes.panes.trades2.markets = spotFlatMarkets
  }
  if (type === 'full') {
      template.states.panes.panes.trades3.markets = perpFlatMarkets
      const exchanges = {};
      for (const market of markets) {
        const exchange = market.split(':')[0];
        if (exchanges[exchange] === undefined) exchanges[exchange] = [];
        exchanges[exchange].push(market);
      }
      for (const key of ['BINANCE', 'BINANCE_FUTURES', 'BYBIT', 'COINBASE', 'OKX', 'DERIBIT']) {
        if (exchanges[key]  === undefined) continue;
        const cvd = getCvd(exchanges[key], key);
        template.states.chart2.indicators[`cvd-exchange-${key}`] = cvdExchangeIndicator(key, cvd);
        template.states.chart2.priceScales[`cvd-exchange-${key}`] = { scaleMargins: {top: 0.79, bottom: 0.03}};
      }
    }
  return template;
}

const marketsBySymbol = {};
for (const market of markets) {
  [exchange, symbol] = market.split(':');
  if (exchange === 'FTX') continue;
  const m = getMarketProduct(exchange, symbol)
  // if (exchange === 'BITFINEX' && symbol === 'DOGE') 
    // console.log(m);
  if (m.type === 'future') continue;
  if (m.quote === undefined || m.quote.indexOf('USD') === -1) continue;
  if (marketsBySymbol[m.base] === undefined) marketsBySymbol[m.base] = {spot: [], perp: []};
  marketsBySymbol[m.base][m.type].push(m);
}

for (const symbol of Object.keys(marketsBySymbol).filter(m => !['USDT'].includes(m))) {
  const types = Object.keys(templates);
  for (const type of types) {
    const m = marketsBySymbol[symbol];
    const spotFlatMarkets = marketsBySymbol[symbol].spot.map(m => m.id);
    const perpFlatMarkets = marketsBySymbol[symbol].perp.map(m => m.id);
    if (!spotFlatMarkets.length) console.log(`No spot markets for ${symbol}`)
    if (!perpFlatMarkets.length) console.log(`No perp markets for ${symbol}`)
    if (!spotFlatMarkets.length || !perpFlatMarkets.length) continue;
    const flattenedMarkets = [...spotFlatMarkets, ...perpFlatMarkets];
    const temp = getTemplate(templates[type], type, symbol, flattenedMarkets, spotFlatMarkets, perpFlatMarkets);
    fs.writeFile(`./templates/Rife${symbol}-${type}.json`, JSON.stringify(temp), 'utf8', err => {
      if (err) console.log('error', err)
    })
  }
}