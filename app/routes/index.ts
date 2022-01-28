'use strict'

import * as util from 'util'
import * as express from 'express'
import { RequestHandler } from 'express'
import passportPromise from '../passport'
import * as jwt from 'jsonwebtoken'
import { decode } from 'jsonwebtoken'
import config from '../config'
import { TokenSet } from 'openid-client'
import * as sqlite3 from 'sqlite3'
import * as fs from 'fs'
import * as crypto from 'crypto'
import * as bodyParser from 'body-parser'
import * as winston from 'winston'
import * as path from 'path'
import * as nonRepudiationProofs from '@i3-market/non-repudiation-proofs'
import  parseJwk from 'jose/jwk/parse'
import client_subscription from '../mqtt/client_subscribtion'
import { Binary } from '@babel/types'

require('isomorphic-fetch');

const router = express.Router()

interface JwtClaims {
  sub: string
  scope: string
}

// Load environment variables
const dotenv = require('dotenv').config({ path: path.resolve(__dirname, '../.env') })
let block_size = Number(process.env.BLOCK_SIZE) || 256;
//router.use(bodyParser.json());
   
// Logger configuration
const logConfiguration = {
  'transports': [
      new winston.transports.File({
          filename: './logs/server.log'
      })
  ]
};

// Create logger
const logger = winston.createLogger(logConfiguration);

// Variables for invoice response to client (hardcoded for now)
let BlockPrice:number = 0.156
let VAT:number = 21
let CompanyName:string = 'Siemens'
let ContractID:string = '0x388FbEd8b353D81769a4585TFc271A6302D45f20'

// Variables to temporary store proofs until they are added to database
let secret;
let proof;
let ID: string = "ID";
let ProviderID;
let PoO;
let PoR;
let ConsumerID;
let exchangeID = 0;
let streamBlockId = 0

export default async (): Promise<typeof router> => {

  //Load Keys from json files
  let privateKeyStrProvider = fs.readFileSync('./keys/privateKeyProvider.json', {encoding:'utf-8', flag:'r'})
  let publicKeyStrProvider = fs.readFileSync('./keys/publicKeyProvider.json', {encoding:'utf-8', flag:'r'})
  let publicKeyStrConsumer = fs.readFileSync('./keys/publicKeyConsumer.json', {encoding:'utf-8', flag:'r'})


  const privateKeyProvider = await parseJwk(JSON.parse(privateKeyStrProvider), 'ES256')
  const publicKeyProvider = await parseJwk(JSON.parse(publicKeyStrProvider), 'ES256')
  const publicKeyConsumer = await parseJwk(JSON.parse(publicKeyStrConsumer), 'ES256')
  /**
   * CORS
   */
  const cors: RequestHandler = (req, res, next) => {
    res.header('Access-Control-Allow-Origin', config.api.allowedOrigin)
    res.header('Access-Control-Allow-Headers', 'Authorization, Content-Type')
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.header('Allow', 'GET, POST, OPTIONS')
    next()
  }
  const passport = await passportPromise()
  router.use(cors)

  router.get('/oidc/login/provider',
    passport.authenticate('oidc', { scope: 'openid vc vce:provider' })
  )

  router.get('/oidc/login/consumer',
    passport.authenticate('oidc', { scope: 'openid vc vce:consumer' })
  )

  router.get('/oidc/cb', passport.authenticate('oidc', { session: false }),
    function (req, res) {
      if (req.user === undefined) throw new Error('token not received')
      const tokenSet = req.user as TokenSet

      console.log(`Access token: ${tokenSet.access_token ?? 'not received'}`)
      if (tokenSet.access_token !== undefined) console.log(util.inspect(decode(tokenSet.access_token, { complete: true }), false, null, true))

      console.log(`ID token: ${tokenSet.id_token ?? 'not received'}`)
      if (tokenSet.id_token !== undefined) console.log(util.inspect(decode(tokenSet.id_token, { complete: true }), false, null, true))

      const jwt = _createJwt({ sub: tokenSet.claims().sub, scope: tokenSet.scope ?? '' })

      ConsumerID = tokenSet.claims().sub

      res.json({ type: 'jwt', jwt })
    }
  )

//Function that creates proof of origin
let proofOfOrigin = async(block_id: number, block: Buffer) => {
  const jwk = await nonRepudiationProofs.createJwk()
  secret = jwk
  ProviderID = 'urn:example:provider'
  const poO = await nonRepudiationProofs.createPoO(privateKeyProvider,
                                                    toArrayBuffer(block),
                                                    ProviderID,
                                                    ConsumerID,
                                                    exchangeID,
                                                    block_id,
                                                    jwk)
  proof = poO
  exchangeID = exchangeID + 1
  return poO
}

// openapi specification
router.get('/openapi', (req,res) => {
  let oas = fs.readFileSync('./openapi/openapi.json', { encoding: 'utf-8', flag: 'r' })
  res.send(oas)
})

//var raw = express.raw({type: 'application/json'})
const textParser = express.text({ type: "application/json" });
const jsonParser = express.json({ type: "application/json" });

router.post('/user', textParser, passport.authenticate('jwtBearer', { session: false }), (req,res) => {
  console.log(req.body)
  res.sendStatus(200)
})

router.post('/acl', jsonParser, passport.authenticate('jwtBearer', { session: false }), (req,res) => {
  var status:number = 200
  console.log(JSON.stringify(req.body))
  
  const header = JSON.parse(JSON.stringify(req.headers))
  if (header['authorization'].startsWith("Bearer ")){
    const token = header['authorization'].substring(7, header['authorization'].length);
    const decodedToken = jwt.decode(token)
    const sub = decodedToken?.sub
    if ( req.body.clientid === sub) {
      if (req.body.topic.startsWith('/to/' + req.body.clientid) || req.body.topic.startsWith('/from/' + req.body.clientid))
        status = 200
      else
        status = 400
    } else {
        status = 400 
    }
} else {
  status = 401
}
res.sendStatus(status)
})

const rawParser = express.raw({ type: "application/octet-stream", limit: 1048576});

router.post('/newdata/:uid', rawParser, passport.authenticate('digest', { session: false }),async(req, res) => {
  try {

    const data = req.body
    const uid:String = String(req.params.uid)

    console.log("Data is >>>>>> "+data)
    console.log("uid is >>>>>> "+uid)
  //if (uid != undefined && data != undefined){
    const db = connectToDatabase('./db/consumer_subscribers.db3')
    const client = client_subscription.mqttinit()

    // NRP
    let rawBufferData = Buffer.from(data)
    proof = await proofOfOrigin(streamBlockId, data)
    const response_data = {block_id: streamBlockId, cipherblock: proof.cipherblock, poO: proof.poO}
    streamBlockId = streamBlockId + 1
    let sql = 'SELECT * FROM consumer_subscribers WHERE DataSourceUid=?'
    db.serialize(function(){
      db.all(sql, [uid], (err, rows) => {
          if (err) {
           console.log(err);
          }
          console.log(rows.length)
          console.log(rows[0])
          
          rows.forEach(function(item, index, array){
          	client.publish('/to/'+item.ConsumerDid+'/'+item.DataSourceUid, JSON.stringify(response_data))
          })
      });
      db.close()
    })
  
    res.status(200).send({ msg: 'Data sent to broker' })

  } catch (error) {
    if(error instanceof Error){
                console.log(`${error.message}`)
                res.status(500).send({name: `${error.name}`, message: `${error.message}`})
            }
  }

})

//Endpoint to which a Data Souce sends stream data
router.post('/newdata',async(req, res) => {

  try {

    const uid = req.body.uid 
    const data = req.body.data

  //if (uid != undefined && data != undefined){
    const db = connectToDatabase('./db/consumer_subscribers.db3')
    const client = client_subscription.mqttinit()

    // NRP
    let rawBufferData = Buffer.from(data)
    proof = await proofOfOrigin(streamBlockId, rawBufferData)
    const response_data = {block_id: streamBlockId, cipherblock: proof.cipherblock, poO: proof.poO}
    streamBlockId = streamBlockId + 1
    let sql = 'SELECT * FROM consumer_subscribers WHERE DataSourceUid=?'
    db.serialize(function(){
      db.all(sql, [uid], (err, rows) => {
          if (err) {
           console.log(err);
          }
          console.log(rows.length)
          console.log(rows[0])
          
          rows.forEach(function(item, index, array){
          	client.publish('/to/'+item.ConsumerDid+'/'+item.DataSourceUid, JSON.stringify(response_data))
          })
      });
      db.close()
    })
  
    res.status(200).send({ msg: 'Data sent to broker' })

  } catch (error) {
    if(error instanceof Error){
                console.log(`${error.message}`)
                res.status(500).send({name: `${error.name}`, message: `${error.message}`})
            }
  }
  }
)

// Checks if auth is working
router.get('/protected', passport.authenticate('digest', { session: false }),
  (req, res) => {
    res.json({ msg: 'Do you think we\'re done?! Put yourself to work, you loser!' })
  }
)

// Invoice call that returns a detailed response about how much the client has to pay
router.post('/createInvoice', (req, res) => {
  try {
    let fromDate = req.body.fromDate
    let toDate = req.body.toDate
    const db = connectToDatabase('./db/provider.db3')
    countBlocks(db, x, fromDate, toDate, res)
    console.log(toDate)
  } catch (error) {
    if(error instanceof Error){
      console.log(`${error.message}`)
      res.status(500).send({name: `${error.name}`, message: `${error.message}`})
  }
  }
})

// Method that verifies if proof of reception is valid and if it is, a hash is sent to Auditable Accounting
// in order to receive a proof of publication
router.post('/validatePoR', async(req, res) => {
  try {
    const PoR = req.body.poR
    const response = validateProofOfReception(PoR)
    res.status(200).send(response)
  } catch (error) {
    if(error instanceof Error){
      console.log(`${error.message}`)
      res.status(500).send({name: `${error.name}`, message: `${error.message}`})
  }
  }
})

// Endpoint to register a datasource
router.post('/regds', passport.authenticate('digest', { session: false }), (req, res) => {
  try {
    const Uid = req.body.uid
    const Description = req.body.description
    const URL = req.body.url
    const Action = req.body.action

    if(Action === 'register'){
      writeRegisteredDataSource(Uid, Description, URL, Action)
      console.log('Datasource added to the database')
      res.status(200).send('OK')
    }
    if(Action === 'unregister'){
      deleteSubscription(Uid)
      console.log('Datasource removed from database')
      res.status(200).send('OK')
    }
  } catch (error) {
    if(error instanceof Error){
      console.log(`${error.message}`)
      res.status(500).send({name: `${error.name}`, message: `${error.message}`})
    }
  }
})

router.post('/:data', passport.authenticate('jwtBearer', { session: false }),
async(req, res) => {
  try {
      logger.info('request body', req.body);

      const resource_name = req.params.data;
      ID = await req.body['block_id'];
      const ACK = await req.body['block_ack'];
      const resource_map_path = `./data/${resource_name}.json`
      const resource_path = `./data/${resource_name}`

      if (fs.existsSync(resource_path)) {
          logger.info('The resource exists')

          if (ID == 'null'){
              const check = checkFile(resource_map_path, resource_path);
              logger.info('File checked')

          }
          var map = fs.readFileSync(resource_map_path, 'utf8');
          let obj = JSON.parse(map);

          //get the data that matches the ID given by the client id
          if (ID === 'null' && ACK === 'null'){
              let index = Object.keys(obj.records[0])
              logger.info(`Response is "block_id": "null", "data": "null", "next_block_id": ${index[0]}`);
              res.send({"block_id": "null", "next_block_id": `${index[0]}`, "cipherblock": "null", "poO": "null"});
          }else if (ID != 'null' && ACK == 'null') {
            try {
              let response: any = await responseData(ID, obj, resource_path);
              let rawBufferData = Buffer.from(response.data)
              console.log('BUFEER: ' + rawBufferData.length)
              proofOfOrigin(parseInt(ID), rawBufferData).then(
                proof => {
                  console.log(proof)
                  delete response['data']
                  const response_data = Object.assign(response, proof)
                  console.log(response_data)
                  let ciphertext = async() => {
                    nonRepudiationProofs.decryptCipherblock(response_data.cipherblock, secret).then(o => {console.log(o)})
                  }
                  ciphertext()
                  res.send(response_data)
                }
              )
            } catch (error) {
              if(error instanceof Error){
                console.log(`${error.message}`)
                res.status(500).send({name: `${error.name}`, message: `${error.message}`})
              }
            }
          } else if ((ID != 'null') && (ACK != 'null')){
            try {
              let response: any = await responseData(ID, obj, resource_path);
              let rawBufferData = Buffer.from(response.data)
              console.log('BUFEER: ' + rawBufferData.length)
              proofOfOrigin(parseInt(ID), rawBufferData).then(
                proof => {
                  delete response['data']
                  const response_data = Object.assign(response, proof)
              res.send(response_data)
              }
              )
            } catch (error) {
              if(error instanceof Error){
                console.log(`${error.message}`)
                res.status(500).send({name: `${error.name}`, message: `${error.message}`})
              }
            }
          } else if ((ID == 'null') && (ACK != 'null')){
              res.send({"block_id": "null", "next_block_id": "null", "cipherblock": "null", "poO": "null"});
          }
      }else{
          res.sendStatus(404);
      }
      }catch(error) {
        if(error instanceof Error){
          console.log(`${error.message}`)
          res.status(500).send({name: `${error.name}`, message: `${error.message}`})
      }
  }
});
  return router
}

function _createJwt (claims: JwtClaims): string {
  /** This is what ends up in our JWT */
  const jwtClaims = {
    iss: config.jwt.iss,
    aud: config.jwt.aud,
    exp: Math.floor(Date.now() / 1000) + 86400, // 1 day (24×60×60=86400s) from now
    ...claims
  }

  /** generate a signed json web token and return it in the response */
  return jwt.sign(jwtClaims, config.jwt.secret)
}

// get file size in bytes
export function getFilesizeInBytes(filename : string) {
  var stats = fs.statSync(filename);
  var fileSizeInBytes = stats.size;
  logger.info(`File size is ${fileSizeInBytes} bytes`)
  return fileSizeInBytes;
}

// check if file exists, if it doesn't create it and append structure
function checkFile(resource_map_path : string, resource_path : string){
  try{
      fs.accessSync(resource_map_path, fs.constants.F_OK);
      logger.info('Map already exists');
  }catch (e){
      const data = '{"records":[]}'
      const create = fs.appendFileSync(resource_map_path, data);
      mapData(resource_map_path, resource_path);
  }
}

// map offset to ID
function mapData(resource_map_path : string, resource_path : string){
  const fd = fs.openSync(resource_path, 'r')
  const size = getFilesizeInBytes(resource_path);
  const nr_of_blocks = Math.ceil(size/block_size);
  logger.info(`Number of blocks: ${nr_of_blocks}`);

  var data = fs.readFileSync(resource_map_path, 'binary');
  let obj = JSON.parse(data);
  let hash = '';
  var index = 0;
  while(index < (nr_of_blocks*block_size)){
      var buffer = Buffer.alloc(block_size);
      fs.readSync(fd, buffer, 0, block_size, index)
      let content = buffer
      hash = crypto.createHash('sha256').update(content+hash).digest('hex');
      logger.info(`Hash of the block is ${hash}`);
              
      obj.records.push({[`${hash}`]:`${index}`});
      index += block_size;
  }
  let json = JSON.stringify(obj);
  fs.writeFileSync(resource_map_path, json);
  logger.info('Map created');
}

// response formating
export async function responseData(ID : string, obj: any, resource_path : string){
  let block = block_size
  // get index of ID
  let keys: string[] = []
  for(let i = 0; i < obj.records.length; i++){
      keys[i] = Object.keys(obj.records[i])[0]
  }
  let getIndex
  if (keys.indexOf(ID) !== undefined){
    getIndex = keys.indexOf(ID);
  } else {
    throw new Error('The inputed Id is wrong')
  }
  // check if you got to last block
  if (getIndex + 1 == keys.length){
      block = getFilesizeInBytes(resource_path) % block_size;
      logger.info(`New block size is: ${block}`)
  }
  // data from coresponding offset
  let buffer = Buffer.alloc(block);
  
  const promise = await new Promise ((resolve) => {
      fs.open(resource_path, 'r+', function (err, fd) { 
      if (err) { 
          return console.error(err); 
      } 
    
      console.log("Reading the file"); 
    
      fs.read(fd, buffer, 0, block, 
          parseInt(obj.records[getIndex][`${ID}`]), function (err, num) { 
              if (err) { 
                  console.log(err); 
              } 
              let content = buffer
              console.log('CONTENT: '+content.length)
              if (getIndex + 1 == keys.length){
              resolve({block_id: ID, data: content, next_block_id: null});
              }else{
              resolve({block_id: ID, data: content, next_block_id:keys[getIndex+1]})
              }
          });
          // Close the opened file. 
          fs.close(fd, function (err) { 
              if (err) { 
                  console.log(err); 
              } 
              console.log("File closed successfully"); 
          });
  }); 
  });
  return promise;
}

// ------------- to be moved to common.ts
function toArrayBuffer(buffer) {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

// -------------- to be moved to sql_functions
// If it doesn't exist create the provider database and return the connection object
// './db/provider.db3'
function connectToDatabase (pathToDb: string){
  let db = new sqlite3.Database(pathToDb, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE
  , (err) => {
      if (err) {
          console.error(err.message);
      } else {
          console.log('Connected to ' +pathToDb+ ' database.');
      }
  });
  return db
}

// ------------- to be moved to common.ts
// Get the date that will be written in the database
function getTimestamp() {
  const currentDate = new Date();
  const dateFormat = `${currentDate.getFullYear()}` +  '-' + ("0" + (currentDate.getMonth() + 1)).slice(-2) + '-' + ("0" + currentDate.getDate()).slice(-2) 
  return dateFormat;
}

// -------------- to be moved to sql_functions
// Write proofs to database
function writeToDatabase(db, Timestamp, ConsumerID, BlockID, PoO, PoR, PoP){

  db.serialize(() => {

  db.prepare('CREATE TABLE IF NOT EXISTS accounting(Date INTEGER, ConsumerID TEXT, BlockID TEXT, PoO TEXT, PoR TEXT, PoP TEXT PRIMARY KEY);', function(err) {
      if (err) {
          console.log(err.message)
      }
      console.log('Check if table exists before adding proofs to database')}).run().finalize();
  console.log("Date => "+Timestamp+" ConsumerID => "+ConsumerID+" BlockID => "+BlockID+" PoO => "+PoO+" PoR => "+ PoR+" PoP => "+PoR)
  db.run('INSERT into accounting(Date, ConsumerID, BlockID, PoO, PoR, PoP) VALUES (?, ?, ?, ?, ?, ?)', [Timestamp, ConsumerID, BlockID, PoO, PoR, PoP], function(err, row){
      if(err){
          console.log(err.message)
      }
      console.log("Proofs added to the table")
  })
      db.close();
  })
}

// Callback function that returns the total BlockPrice
function x (rows) {
  let totalPrice = rows.length * BlockPrice
  return totalPrice
}

// -------------- to be moved to sql_functions
// Function that returns the total ammount the client has to pay
function countBlocks(db, callback, fromDate, toDate, res){
  let sql = 'SELECT * FROM accounting where Date >= ? AND Date <= ?'
  db.serialize(function(){
      db.all(sql, [fromDate, toDate], (err, rows) => {
          if (err) {
           callback(err);
          }
          let totalPrice = callback(rows)
          let NumBlock = totalPrice / BlockPrice
          res.json({ConsumerID: `${ConsumerID}`, CompanyName: `${CompanyName}`, VAT: `${VAT}`, ContractID: `${ContractID}`, NumBlock: `${NumBlock}`, BlockSize: `${block_size}`, BlockPrice: `${BlockPrice}`, TotalAmount: totalPrice})
      });
})
}

export async function validateProofOfReception (PoR:string) {

  PoR = PoR.replace('"','')
  console.log('The POR is >>> '+PoR)
  let publicKeyStrConsumer = fs.readFileSync('./keys/publicKeyConsumer.json', {encoding:'utf-8', flag:'r'})
  const publicKeyConsumer = await parseJwk(JSON.parse(publicKeyStrConsumer), 'ES256')

  console.log("The poO is"+ proof['poO'])
  const validPoR = await nonRepudiationProofs.validatePoR(publicKeyConsumer, PoR, proof['poO'])
  if (validPoR === true) {
    console.log(secret)
    PoO = proof['poO']
    const jsonObject = `{ ${ID}: { PoO: ${PoO}, PoR: ${PoR} } }`
    const hash = crypto.createHash('sha256').update(jsonObject).digest('hex');
    console.log("The hash is: " + hash)
    let resource: any = await fetch(`http://95.211.3.244:8090/registries`, {
        method: 'POST',
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ "dataHash": `${hash}`}),
    })
        .catch((error) => {
            console.error('Error:', error);
        });
    const PoP = await resource.json();
    console.log(JSON.stringify(PoP))
    const db = connectToDatabase('./db/provider.db3')
    const Timestamp = getTimestamp()
    writeToDatabase(db, Timestamp, ConsumerID, ID, PoO, PoR, JSON.stringify(PoP))
    const response = {"jwk": secret, "poP": PoP}
    return response
}
}

// -------------- to be moved to sql_functions
// Write registered datasources to database
function writeRegisteredDataSource(Uid, Description, URL, Timestamp){
  
  var db = connectToDatabase('./db/data_sources.db3')
  
  db.serialize(() => {

  db.prepare('CREATE TABLE IF NOT EXISTS data_sources(Uid TEXT, Description TEXT, URL TEXT, Timestamp TEXT);', function(err) {
      if (err) {
          console.log(err.message)
      }
      console.log('Check if table exists before adding data source to database')}).run().finalize();
  console.log("Uid => "+Uid+" Description => "+Description+" URL => "+URL+" Timestamp => "+Timestamp)
  db.run('INSERT into data_sources(Uid, Description, URL, Timestamp) VALUES (?, ?, ?, ?)', [Uid, Description, URL, Timestamp], function(err, row){
      if(err){
          console.log(err.message)
      }
      console.log("Entry added to ./db/data_sources.db3")
  })
      db.close();
  })
}
// export function getProof(){
//   return proof
// }
// -------------- to be moved to sql_functions
function deleteSubscription (Uid){

	var db = connectToDatabase('./db/data_sources.db3')
	db.serialize(() => {
		db.run('DELETE FROM data_sources WHERE Uid=?', Uid, function(err, row){
      if(err){
          console.log(err.message)
      }
  })
      db.close();
	})
}