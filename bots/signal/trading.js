require('dotenv').config()
const { MainClient } = require('binance');

const {sendMessageToAll} = require('./messages')

const blacklist = [
  "SDUSDT"
]

const whitelist = [
  "BTC",
  "ETH",
  "BIT",
  "USDT",
  "XRP",
  "DOGE",
  "DOT",
  "EOS",
  "LTC",
  "XLM",
  "UNI",
  "SUSHI",
  "YFI",
  "LINK",
  "AAVE",
  "COMP",
  "MKR",
  "DYXS",
  "MANA",
  "AXS",
  "CHZ",
  "ADA",
  "ICP",
  "KSM",
  "BCH",
  "XTZ",
  "KLAY",
  "PERP",
  "ANKR",
  "CRV",
  "ZRX",
  "AGLD",
  "BAT",
  "OMG",
  "TRIBE",
  "USDC",
  "QNT",
  "GRT",
  "SRM",
  "SOL",
  "FIL",
  "LUNK",
  "WAVES",
  "SHIB",
  "SPELL",
  "SAND",
  "MATIC",
  "ALGO",
  "FTM",
  "CBX",
  "CBX",
  "IMX",
  "GODS",
  "FTT",
  "ENJ",
  "WOO",
  "ATOM",
  "ENS",
  "AVAX",
  "GM",
  "CWAR",
  "GALFT",
  "BNB",
  "CELO",
  "GENE",
  "SLP",
  "STETH",
  "LFW",
  "C98",
  "PSP",
  "AWA",
  "SHILL",
  "XEM",
  "ONE",
  "XYM",
  "INSUR",
  "BOBA",
  "CAKE",
  "PTU",
  "TRVL",
  "DCR",
  "QTUM",
  "RVN",
  "BTG",
  "XEC",
  "DGB",
  "KMA",
  "GALA",
  "JASMY",
  "RNDR",
  "WEMIX",
  "BICO",
  "SIS",
  "1INCH",
  "TEL",
  "SNX",
  "REN",
  "BNT",
  "HOT",
  "UMA",
  "CEL",
  "NEXO",
  "REAL",
  "IZI",
  "LRC",
  "LDO",
  "KRL",
  "DEVT",
  "CRAFT",
  "RUNE",
  "THETA",
  "HBAR",
  "XDC",
  "ZEN",
  "ZIL",
  "HNT",
  "ICX",
  "EGLD",
  "PLT",
  "1SOL",
  "RUN",
  "MX",
  "DFL",
  "RAIN",
  "SOS",
  "KASTA",
  "GAS",
  "STX",
  "VPAD",
  "FLOW",
  "SIDUS",
  "GGM",
  "USTC",
  "MV",
  "LOOKS",
  "NEAR",
  "MINA",
  "SOLO",
  "MBS",
  "BUSD",
  "DAI",
  "ACA",
  "MIX",
  "GMX",
  "ERTHA",
  "NFT",
  "BTT",
  "SUN",
  "JST",
  "TRX",
  "TAP",
  "SYNR",
  "POSI",
  "ACH",
  "T",
  "RSS3",
  "PSTAKE",
  "SCRT",
  "SON",
  "POKT",
  "SC",
  "DOME",
  "HERO",
  "MOVR",
  "GLMR",
  "IME",
  "FIDA",
  "PAXG",
  "ZBC",
  "SD",
  "APE",
  "ZAM",
  "CAPS",
  "RACA",
  "STG",
  "LMR",
  "WBTC",
  "XAVA",
  "MELOS",
  "GMT",
  "GST",
  "ROSE",
  "LGX",
  "SFUND",
  "ELT",
  "APEX",
  "FITFI",
  "XWG",
  "KMON",
  "COT",
  "STRM",
  "FLOKI",
  "PLY",
  "GAL",
  "FCD",
  "AR",
  "CTC",
  "KOK",
  "FAME",
  "USDD",
  "KDA",
  "OP",
  "MOVEZ",
  "THN",
  "LUNA",
  "DFI",
  "WAXP",
  "VINU",
  "KUNCI",
  "WLKN",
  "BEL",
  "FORT",
  "OBX",
  "SEOR",
  "EUROC",
  "MNZ",
  "CULT",
  "NXD",
  "CUSD",
  "CMP",
  "GSTS",
  "FIU",
  "SLG",
  "XETA",
  "AZY",
  "MMC",
  "DRIV",
  "USDT.E",
  "STAT",
  "ETC",
  "SAITAMA",
  "KON",
  "DICE",
  "DIFY",
  "PSG",
  "BAR",
  "JUV",
  "ACM",
  "INTER",
  "AFC",
  "CITY",
  "TON",
  "OKSE",
  "USDC.E",
  "CHRP",
  "LING",
  "WWY",
  "OKG",
  "DLC",
  "SWEAT",
  "INJ",
  "ETHW",
  "ETHF",
  "MPLX",
  "MIBR",
  "CO",
  "AGLA",
  "ROND",
  "QMALL",
  "PUMLX",
  "GCAKE",
  "ESNC",
  "APT",
  "KCAL",
  "MCRT",
  "MTK",
  "MASK",
  "ECOX",
  "HFT",
  "PEOPLE",
  "TFT",
  "ORT",
  "HOOK",
  "OAS",
  "MCT",
  "PRIMAL",
  "MAGIC",
  "MEE"
]

const {
  InverseClient,
  LinearClient,
  InverseFuturesClient,
  SpotClient,
  SpotClientV3,
  UnifiedMarginClient,
  USDCOptionClient,
  USDCPerpetualClient,
  AccountAssetClient,
  CopyTradingClient,
} = require('bybit-api');

const { RestClient } = require("okx-api")
const { HbApi } = require('huobi-api-js')
const api = require('kucoin-node-api')



async function getKucoinRates(bot){
  

  const config = {
    apiKey: bot.getEnv().KUCOIN_API_KEY,
    secretKey: bot.getEnv().KUCOIN_API_SECRET,
    passphrase: bot.getEnv().KUCOIN_API_PASS,
    environment: 'live'
  }

  await api.init(config)
  let result = []

  try {
    
    result = await api.getAllTickers()
    result = result.data.ticker
    
    result.map(r => {
      r.bid = r.sell
      r.ask = r.buy
      r.symbol = r.symbol.replace("-", "")
      r.price = r.last
    })

    // console.log(result)

  } catch(e) {

    console.log("error:", e)

  }
  
  return result
}

async function getHbRates(bot){
  const options = {
    apiBaseUrl: 'https://api.huobipro.com',
    profileConfig: {
        accessKey: bot.getEnv().HUOBI_API_KEY,
        secretKey: bot.getEnv().HUOBI_API_SECRET,
        debug: false
    },
  }

  let result = []

  try{

    const hbApi = new HbApi(options)

    result = await hbApi.restApi({ path: `/market/tickers`, method: 'GET' })
    result.map(t => {
      t.symbol = t.symbol.toUpperCase()
      t.price = t.bid
      t.volume = t.vol
    })

  } catch(e){
    console.log('error: ', e)
  }

  return result  
}

async function getOkxRates(bot){
  
  const client = new RestClient({
    apiKey: bot.getEnv().OKX_API_KEY,
    // apiKey: 'apiKeyHere',
    apiSecret: bot.getEnv().OKX_API_SECRET,
    // apiSecret: 'apiSecretHere',
    apiPass: bot.getEnv().OKX_API_PASS,
    // apiPass: 'apiPassHere',
  });

  let result = []

  try{

    result =  await client.getTickers("SPOT")

    result.map(r => {
      r.symbol = r.instId.replace("-", "")
      r.price = r.last
      r.volume = r.vol24h
      r.ask = r.askPx
      r.bid = r.bidPx
    })
    
  } catch(e){

    console.error("getApiKeyInfo error: ", e);

  }

  return result

}

async function getBybitRates(bot){


const BYBIT_API_KEY = bot.getEnv().BYBIT_API_KEY
const BYBIT_API_SECRET = bot.getEnv().BYBIT_API_SECRET

const useTestnet = false;

const client = new LinearClient({
  key: BYBIT_API_KEY,
  secret: BYBIT_API_SECRET,
  testnet: useTestnet
},
  // requestLibraryOptions
);

  let result = []
  try{

    result =  await client.getTickers({})

    // console.log("getApiKeyInfo result: ", result);
    result = result.result
    
    result.map(el => {
      el.price = el.index_price
      el.bid = el.index_price //el.bid_price
      el.ask = el.index_price //el.ask_price
      el.volume = el.volume_24h
    })
  } catch(e){

    console.error("getApiKeyInfo error: ", e);

  }

  return result

}

async function getBinanceRates(bot) {
  const BINANCE_API_KEY = bot.getEnv().BINANCE_API_KEY;
  const BINANCE_API_SECRET = bot.getEnv().BINANCE_API_SECRET;

  const client = new MainClient({
    api_key: BINANCE_API_KEY,
    api_secret: BINANCE_API_SECRET,
  });

  let result = []
  
  try {

    result = await client.getSymbolPriceTicker()

    // console.log('getExchangeInfo inverse result: ', result);
  } catch(e){
  
    console.error('getExchangeInfo inverse error: ', e);
  
  }
    
  
  return result
  
}

function compare(bot, binance, bybit, firstEx, secondEx) {
  let compare = []

  binance.map(bi => {

    let by = bybit.find(el => el.symbol == bi.symbol)
    
    if (by) {
      
      // let diff1 = (parseFloat(bi.bid) - parseFloat(by.ask)) / parseFloat(bi.bid) * 100
      // let diff2 = (parseFloat(by.bid) - parseFloat(bi.ask)) / parseFloat(by.bid) * 100
      
      let diff1 = (parseFloat(by.ask) - parseFloat(bi.bid)) / parseFloat(by.ask) * 100
      let diff2 = (parseFloat(bi.ask) - parseFloat(by.bid)) / parseFloat(bi.ask) * 100
      

      let direction = diff1 > diff2 ? 1 : 2
      let diff = diff1 > diff2 ? diff1 : diff2
      let buy_price = diff1 > diff2 ? bi.ask : by.ask
      let sell_price = diff1 > diff2 ? by.bid : bi.bid

      let percent = (sell_price - buy_price) / buy_price * 100

      //     profitted.push(c)
      // console.log("INSIDE: ", percent, percent > 0 && percent > bot.getEnv().MIN_PROFIT && percent < bot.getEnv().MAX_PROFIT)
      if (percent > 0 && percent > bot.getEnv().MIN_PROFIT && percent < bot.getEnv().MAX_PROFIT){
        if (parseFloat(by.volume) > bot.getEnv().MIN_VOLUME && parseFloat(bi.volume) > bot.getEnv().MIN_VOLUME){
          // console.log('SYMBOL:', by.symbol)
          // console.log("bi.bid: ", bi.bid)
          // console.log("bi.ask: ", bi.ask)
          // console.log("by.ask: ", by.ask)
          // console.log("by.bid: ", by.bid)
          

          // console.log("diff1", diff1)
          // console.log("diff2", diff2)
          // console.log('diff', diff)

          compare.push({
            binance: bi,
            bybit: by,
            direction: direction,
            buyOnEx: direction == 2 ? secondEx : firstEx,
            sellOnEx: direction == 2 ? firstEx : secondEx,
            buy_price: buy_price,
            sell_price: sell_price,
            diff: percent, //(parseFloat(bi.price) - parseFloat(by.price)) / parseFloat(bi.price) * 100
          })
          // console.log("on finish")
        }
      }
    }

  })

  

  // blacklist.map(bl => {
  //   compare = compare.filter( bl => bl.binance.symbol != (bl + 'USDT'))
  // })

  let filtered = []
  whitelist.map(wl => {
    let fil = compare.find(el => el.binance.symbol == (wl + 'USDT'))  
    if (fil)
      filtered.push(fil)
  });

  filtered.sort((a,b) => {return a.diff - b.diff})

  return filtered
}

async function prepareReport(bot, data, firstEx, secondEx) {
  
  
  for( m of data ) {

    let report = ""
    report += `Символ: ${m.binance.symbol}\n`
    report += `Прибыль: ${parseFloat(m.diff).toFixed(2)}%\n`
    report +=  `Купить на ${m.buyOnEx} по курсу ${m.buy_price}\n`
    report +=  `Продать на ${m.sellOnEx} по курсу ${m.sell_price}\n`
    
    // console.log(report)
    // console.log(firstEx, secondEx)
    // console.log(m)
    await sendMessageToAll(bot, {text: report})  
  
  }

  // data.map(m => {
    
    
  // })
  
  

}


async function getAllRates(bot) {
  
  // console.log(huobi)
  // console.log("okx", okx)

  // let binance = await getBinanceRates()
  
  let okx = await getOkxRates(bot)
  let huobi = await getHbRates(bot)
  let bybit = await getBybitRates(bot)
  let kucoin = await getKucoinRates(bot)

  console.log(new Date())

  // console.log("\nHUOBI - OKX")
  let data = []

  let HuobiOkx = await compare(bot, huobi, okx, 'huobi', 'okx')
  
  // data.push({
  //   data: HuobiOkx,
  //   from: 'huobi',
  //   to: 'okx'
  // })

  await prepareReport(bot, HuobiOkx, 'huobi', 'okx')  
  
  // console.log("\nBYBIT - OKX")
  let BybitOkx = await compare(bot, bybit, okx, 'bybit', 'okx')
  
  // data.push({
  //   data: BybitOkx,
  //   from: 'bybit',
  //   to: 'okx'
  // })

  await prepareReport(bot, BybitOkx, 'bybit', 'okx')  
  
  // console.log("\nKUKOIN - OKX")
  let KucoinOkx = await compare(bot, kucoin, okx, 'kucoin', 'okx')
  
  // data.push({
  //   data: KucoinOkx,
  //   from: 'kucoin',
  //   to: 'okx'
  // })
  await prepareReport(bot, KucoinOkx, 'kucoin', 'okx')  

  
  // console.log("\nHUOBI - BYBIT")
  let HuobiBybit = await compare(bot, huobi, bybit, 'huobi', 'bybit')
  
  // data.push({
  //   data: HuobiBybit,
  //   from: 'huobi',
  //   to: 'bybit'
  // })

  await prepareReport(bot, HuobiBybit, 'huobi', 'bybit')  
  
  // console.log("\nKUKOIN - HUOBI")
  let KucoinHuobi = await compare(bot, kucoin, huobi, "kucoin", "huobi")

  // data.push({
  //   data: KucoinHuobi,
  //   from: 'kucoin',
  //   to: 'huobi'
  // })


  await prepareReport(bot, KucoinHuobi, 'kucoin', 'huobi')  

  // console.log("\nBYBIT - KUCOIN")
  let BybitKucoin = await compare(bot, bybit, okx, 'bybit', 'kucoin')
  
  // data.push({
  //   data: BybitKucoin,
  //   from: 'bybit',
  //   to: 'kucoin'
  // })



  await prepareReport(bot, BybitKucoin, 'bybit', 'kucoin')  
  

  // console.log(data)
  console.log('_____________')
  
}

module.exports = {
  getAllRates
}