const fs = require('fs')
const {markets} = require('./markets.json')
const template_chart = require("./template_chart.json")
const template_full = require("./template_full.json")
const template_tape = require("./template_tape.json")

const templates = {
  chart: template_chart,
  full: template_full,
  tape: template_tape
}

const baseQuoteLookupKnown = new RegExp(
    `^([A-Z0-9]{3,})[-/:]?(USDT|USDC|TUSD|BUSD)$|^([A-Z0-9]{2,})[-/:]?(UST|EUR|USD)$`
  )

const baseQuoteLookupOthers = new RegExp(`^([A-Z0-9]{2,})[-/]?([A-Z0-9]{3,})$`)
const baseQuoteLookupPoloniex = new RegExp(`^(.*)_(.*)$`)

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
    } else if (exchangeId === 'FTX' && type === 'future') {
      localSymbol = localSymbol.replace(/(\w+)-\d+$/, '$1-USD')
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
  
    let match
  
    if (exchangeId === 'POLONIEX') {
      match = symbol.match(baseQuoteLookupPoloniex)
  
      if (match) {
        match[0] = match[2]
        match[2] = match[1]
        match[1] = match[0]
  
        localSymbolAlpha = match[1] + match[2]
      }
    } else {
      match = localSymbol.match(baseQuoteLookupKnown)
  
      if (!match) {
        match = localSymbolAlpha.match(baseQuoteLookupOthers)
      }
    }
  
    if (
      !match &&
      (exchangeId === 'DERIBIT' || exchangeId === 'FTX' || exchangeId === 'HUOBI')
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

function getTemplate(template, type, symbol, markets, spotFlatMarkets, perpFlatMarkets, cvdSpot, cvdPerp, deltaSpot, deltaPerp, basis) {
  const title = `Rife${symbol} ${type}`;
  const id = `rife${symbol}${type}_v` + Date.now()
  template.name = title;
  template.id = id + Date.now()
  if (type !== 'tape') {
    template.states.panes.panes.chart.markets = markets;
    template.states.chart.indicators["cvd-spot"].script = cvdSpot
    template.states.chart.indicators["cvd-perp"].script = cvdPerp
    template.states.chart.indicators["delta-spot"].script = deltaSpot
    template.states.chart.indicators["delta-perp"].script = deltaPerp
    template.states.chart.indicators["basis"].script = basis
  }
  if (type !== 'chart') {
    template.states.panes.panes.stats.markets = perpFlatMarkets
    template.states.panes.panes.stats2.markets = spotFlatMarkets
    template.states.panes.panes.trades.markets = perpFlatMarkets
    template.states.panes.panes.trades2.markets = spotFlatMarkets
  }
  if (type === 'full')
    template.states.panes.panes.trades3.markets = perpFlatMarkets
  return template;
}

const getCvd = (market, type) => {
  const vbuy = market[type].map(m => m.id).join(".vbuy+") + ".vbuy";
  const vsell = market[type].map(m => m.id).join(".vsell+") + ".vsell";
  return `_vbuy=(${vbuy})\n_vsell=(${vsell})\nline(cum(_vbuy-_vsell), title=${type})`
}

getBasis = (market) => {
  const spot = market.spot.map(m => m.id);
  const perp = market.perp.map(m => m.id);
  return `spot=(${spot.join(".close+")}.close)/${spot.length}\nperp=(${perp.join(".close+")}.close)/${perp.length}\nd = spot-perp\n\ncloudarea(d, 0, title=Basis)`
}

getDelta = (market, type) => {
  const vbuy = market[type].map(m => m.id).join(".vbuy+") + ".vbuy";
  const vsell = market[type].map(m => m.id).join(".vsell+") + ".vsell";
  return `_vbuy=(${vbuy})\n_vsell=(${vsell})\n\nvolume = _vbuy+_vsell\na = sma(Math.pow(volume,2),options.length)\nb = Math.pow(sum(volume,options.length),2)/Math.pow(options.length,2)\nstdev = Math.sqrt(a - b)\nbasis = sma(volume, options.length)\ndev = 1 * stdev\ntreshold = basis + dev\n\ndelta = _vbuy - _vsell\n\nplothistogram({ time: time, value: (delta), color: delta > 0 ? ( volume > treshold ? options.upColorHighVol : options.upColorLowVol) : ( volume > treshold ? options.downColorHighVol : options.downColorLowVol)}, title=\"Delta ${type}\")`
}

const marketsBySymbol = {};
for (const market of markets) {
  [exchange, symbol] = market.split(':');
  if (exchange === 'FTX') continue;
  const m = getMarketProduct(exchange, symbol)
  if (m.type === 'future') continue;
  if (m.quote === undefined || m.quote.indexOf('USD') === -1) continue;
  if (marketsBySymbol[m.base] === undefined) marketsBySymbol[m.base] = {spot: [], perp: []};
  marketsBySymbol[m.base][m.type].push(m);
}

for (const symbol of Object.keys(marketsBySymbol).filter(m => !['USDT'].includes(m))) {
  const types = ["chart", "full", "tape", ];
  for (const type of types) {
    const m = marketsBySymbol[symbol];
    const cvdSpot = getCvd(m, 'spot');
    const cvdPerp = getCvd(m, 'perp');
    const deltaSpot = getDelta(m, 'spot');
    const deltaPerp = getDelta(m, 'perp');
    const basis = getBasis(m);
    const spotFlatMarkets = marketsBySymbol[symbol].spot.map(m => m.id);
    const perpFlatMarkets = marketsBySymbol[symbol].perp.map(m => m.id);
    if (!spotFlatMarkets.length) console.log(`No spot markets for ${symbol}`)
    if (!perpFlatMarkets.length) console.log(`No perp markets for ${symbol}`)
    if (!spotFlatMarkets.length || !perpFlatMarkets.length) continue;
    const flattenedMarkets = [...spotFlatMarkets, ...perpFlatMarkets];
    const temp = getTemplate(templates[type], type, symbol, flattenedMarkets, spotFlatMarkets, perpFlatMarkets, cvdSpot, cvdPerp, deltaSpot, deltaPerp, basis);
    fs.writeFile(`./templates/${type}/Rife${symbol}-${type}.json`, JSON.stringify(temp), 'utf8', err => {
      if (err) console.log('error', err)
    })
  }
}



