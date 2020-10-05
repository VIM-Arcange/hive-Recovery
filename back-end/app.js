const { Client, PrivateKey } = require('@hiveio/dhive');
const axios = require('axios');
const cryptoJS = require('crypto-js')
const imaps = require('imap-simple');
const nodemailer = require("nodemailer")
const steem = require("steem");
const parser = require("mailparser").simpleParser

const config = require("./config.js")
const hiveClient = new Client(config.node);

hiveClient.database.getVersion().then((res) => {
  //console.log("blockchain version",res.blockchain_version)
  if (res.blockchain_version !== '0.23.0') {
    hiveClient.updateOperations(true)
  }
})

const email = config.email;
const smtp = nodemailer.createTransport({
  host: email.smtp,
  port: email.port,
  secure: false,
  ignoreTLS: true
})

const bDebug = process.env.DEBUG==="true"

const msSecond = 1 * 1000
const msMinute = 60 * msSecond
const msHour = 60 * msMinute
const msDay = 24* msHour
const second = 1
const minute = 60 * second
const hour = 60 * minute

async function notify(subject,body="") {
  try {
    const info = await smtp.sendMail({
      from: email.from,
      to: email.to,
      subject: subject,
      text: body,
      html: body
    })
  } 
  catch(e) {
    console.error(e)
  }
}

function datetoISO(date) {
  return date.toISOString().replace(/T|Z/g," ")
}

function log(message) {
  console.log(`${datetoISO(new Date())} - ${message}`);
}

function logerror(message) {
  console.error(`${datetoISO(new Date())} - ${message}`);
  if(config.email) {
    notify(`[Hive-Recovery] Error: ${message}`)
  }
}

function logdebug(message) {
  if(bDebug || config.debug) console.log(`${datetoISO(new Date())} - ${message}`);
}

function checkUndefined(value,message) {
  if(!value) throw new Error(message)
  return value
}

async function post(data) {
	try {
		const response = await axios.post(config.node, data);
		if (response.error) {
			throw new Error(`Error POST ${url} : ${JSON.stringify(response)}`)
		}
		return response.data;
	}
	catch(e) {
		throw new Error(`${url} -> ${e.message}`)
	}
}

async function get_accounts(accounts) {
  const call = {
    "jsonrpc":"2.0",
    "id":1,
    "method":"condenser_api.get_accounts", 
    "params":[accounts]
  }
  return (await post(call)).result
}

async function get_accounts_history(account, start, limit) {
  const call = {
    "jsonrpc":"2.0",
    "id":1,
    "method":"condenser_api.get_account_history", 
    "params":[account, start, limit]
  }
  return (await post(call)).result
}

// Search for last Account Recovery setup (must be made made min 30 days ago)
async function findSetup(name) {
  try {
    const MIN_DELAY = 30
    const timestamp = Date.now() - (MIN_DELAY*msDay);
    const page = 5
    let lastID = (await get_accounts_history(config.account.name, -1, 0))[0][0]
    while(lastID > 0) {
      const history = (await get_accounts_history(config.account.name, lastID, Math.min(lastID,page-1)))
      const setup = history.filter(o => Date.parse(o[1].timestamp) < timestamp && o[1].op[0]=="transfer" && o[1].op[1].from==name)
      const tx = setup.pop()
      if(tx) {
        return tx
      }
      lastID -= page
    }
    return undefined
  } catch(e) {
    logerror(e.message)
  }
}

// Search for last Recovery Request made in last 24h
async function findRequest(name) {
  try {
    const LIMIT = 1
    const timestamp = Date.now() - (LIMIT*msDay);
    const page = 100
    let lastID = (await get_accounts_history(config.account.name, -1, 0))[0][0]
    while(lastID > 0) {
      const history = (await get_accounts_history(config.account.name, lastID, Math.min(lastID,page-1)))
      const request = history.filter(o => Date.parse(o[1].timestamp) > timestamp && o[1].op[0]=="request_account_recovery" && o[1].op[1].account_to_recover==name)
      const tx = request.pop()
      if(tx) {
        logdebug(tx)
        return tx
      }
      // Stop browsing tx older than LIMIT
      if(Date.parse((history.pop())[1].timestamp) < timestamp ) {
        return undefined
      }
      lastID -= page
    }
    return undefined
  } catch(e) {
    logerror(e.message)
  }
}

async function processBody(from, text)  {
  const data = JSON.parse(text)

  if(!data.account) throw new Error("No account")
  if(!data.secret) throw new Error("No secret")
  if(!data.pubkey) throw new Error("No pubkey")

  // Check if we are the recovery account
  const account = (await get_accounts([config.account.name]))[0]
  if(!account) throw new Error(`Failed to retrieve account data for ${config.account.name}`)
  if(!account.recovery_account==config.account.name) throw new Error("Invalid recovery account")
  // Search for setup transaction
  const txSetup = await findSetup(data.account)
  if(!txSetup) throw new Error(`No setup found for ${data.account}`)
  // decode transaction memo using our memo key
  const memo = steem.memo.decode(config.account.memo,txSetup[1].op[1].memo)
  logdebug(memo)
  // decode payload using passphrase
  const decrypted = cryptoJS.AES.decrypt(memo.substring(1),data.secret).toString(cryptoJS.enc.Utf8)
  const payload =  JSON.parse(decrypted)
  if(payload.account!=data.account) throw new Error(`Account mismatch - payload:${payload.account} sent:${data.account}`)
  if(payload.email && payload.email!=from) throw new Error(`Email mismatch - payload:${payload.email} sent:${from}`)
  // search for last recovery request
  const txRequest =  await findRequest(name)
  if(txRequest) throw new Error(`Declined - Wait 24 hours between requests`)

  const opRecovery = [ "request_account_recovery",
    {
      "recovery_account":config.account.name,
      "account_to_recover":data.account,
      "new_owner_authority": {"weight_threshold":1,"account_auths":[],"key_auths":[[data.pubkey,1]] },
      "extensions":[]
    }
  ]

  await hiveClient.broadcast.sendOperations([op], PrivateKey.from(config.account.active))
  notify(`[Hive-Recovery] recovery process initiated for ${data.account}`)
}

const service = async () => {
  try {
    logdebug("Process started")

    const connection = await imaps.connect({"imap": config.imap})
    const inbox = await connection.openBox('INBOX')
    logdebug(`Inbox contains ${inbox.messages.total} messages`)
    const searchCriteria = ['ALL'];
    const fetchOptions = { bodies: ['','HEADER.FIELDS (FROM)'], struct: false };
    const messages = await connection.search(searchCriteria, fetchOptions);

		for(const message of messages) {
      try {
        const parsed = await parser(message.parts[0].body)
        const body = parsed.text.trim().replace("\n"," ")
        const from = parsed.from.value[0].address
  
        log(`Processing message from ${from} - ${parsed.subject}`)
        await processBody(from, body)			
        // Mark message for deletion if successfully processed
        await imap.addFlags(message.attributes.uid, "\Deleted")
      } catch(e) {
        logerror(e.message)
      }
		}
    await connection.imap.closeBox(true)
    connection.end();
  } catch (e) {
    logerror(e.message)
  } finally {
    logdebug("Process completed")
  }
}

async function test() {
  service()
}

(async () => {
  if(bDebug) {
    log("Debug Started ")
    test()
  } else {
    // Minimum interval is 60 seconds
    if((config.interval || 0) < 60) {
      config.interval = 60
    }

    log("Service Started ")
    log(`HTTP Node: ${config.node}`)
    log(`Interval: ${config.interval} seconds`)

    service();
    //Running `startProcessing` function every [INTERVAL] seconds
    setInterval(service, config.interval * msSecond)
  }
})();
