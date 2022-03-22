'use strict'
import * as util from 'util'
import * as express from 'express'
import { RequestHandler } from 'express'
import passportPromise from '../passport'
import * as jwt from 'jsonwebtoken'
import { decode } from 'jsonwebtoken'
import config from '../config'
import { TokenSet } from 'openid-client'
import * as fs from 'fs'
import client_subscription from '../mqtt/client_subscribtion'
import * as nonRepudiationLibrary from '@i3m/non-repudiation-library'
import * as common from '../commom'
import { connectToDatabase, countBlocks, writeRegisteredDataSource, deleteSubscriptionToDataSource, saveAmmountOfDataSent, streamingAccountReport, accountDataBlock } from '../sqliteFunctions'

require('isomorphic-fetch');


const router = express.Router()

interface JwtClaims {
  sub: string
  scope: string
}

let id: string = "id";
let consumer_id:string;
let block_id = 0
let npProvider:nonRepudiationLibrary.NonRepudiationProtocol.NonRepudiationOrig;

export default async (): Promise<typeof router> => {

  //const providerJwks = await nonRepudiationLibrary.generateKeys('ES256')
  // const publicJwk = JSON.stringify(providerJwks.publicJwk)

  const privateJwk:nonRepudiationLibrary.JWK = {
    kty: 'EC',
    crv: 'P-256',
    x: '342tToZrvj64K-0vPuq9B5t8Bx3kjOlVW574Q2vo-zY',
    y: 'KtukEk-5ZSvJznoWYl99l6x8CbxbMDYJ7fBbwU8Dnpk',
    d: 'bF0ufFC_AHEY98HIZnqLdIMp1Hnh-8Y2sglQ15GOp7k',
    alg: 'ES256'
  }

  const publicJwk:nonRepudiationLibrary.JWK = {
    kty: 'EC',
    crv: 'P-256',
    x: '342tToZrvj64K-0vPuq9B5t8Bx3kjOlVW574Q2vo-zY',
    y: 'KtukEk-5ZSvJznoWYl99l6x8CbxbMDYJ7fBbwU8Dnpk',
    alg: 'ES256'
  }
  const dataExchangeAgreement: nonRepudiationLibrary.DataExchangeAgreement = {
    // Public key of the origin (data provider) for verifying the proofs she/he issues. It should be providerJwks.publicJwk
    orig: JSON.stringify(publicJwk),
    // Public key of the destination (data consumer)
    dest: JSON.stringify(publicJwk),
    // Encryption algorithm used to encrypt blocks. Either AES-128-GCM ('A128GCM') or AES-256-GCM ('A256GCM)
    encAlg: 'A256GCM',
    // Signing algorithm used to sign the proofs. It'e ECDSA secp256r1 with key lengths: either 'ES256', 'ES384', or 'ES512' 
    signingAlg: 'ES256',
    // Hash algorith used to compute digest/commitments. It's SHA2 with different output lengths: either 'SHA-256', 'SHA-384' or 'SHA-512'
    hashAlg: 'SHA-256',
    // The ledger smart contract address (hexadecimal) on the DLT
    ledgerContractAddress: '0x8d407a1722633bdd1dcf221474be7a44c05d7c2f',
    // The orig (data provider) address in the DLT (hexadecimal).
    ledgerSignerAddress: '0x17bd12C2134AfC1f6E9302a532eFE30C19B9E903',
    // Maximum acceptable delay between the issuance of the proof of origing (PoO) by the orig and the reception of the proof of reception (PoR) by the orig
    pooToPorDelay: 10000,
    // Maximum acceptable delay between the issuance of the proof of origing (PoP) by the orig and the reception of the proof of publication (PoR) by the dest
    pooToPopDelay: 20000,
    // If the dest (data consumer) does not receive the PoP, it could still get the decryption secret from the DLT. This defines the maximum acceptable delay between the issuance of the proof of origing (PoP) by the orig and the publication (block time) of the secret on the blockchain.
    pooToSecretDelay: 150000
  }

  const dltConfig: Partial<nonRepudiationLibrary.DltConfig> = {
    rpcProviderUrl: 'http://95.211.3.244:8545'
  }

  const providerDltSigningKeyHex:string = '0x4b7903c8fe18e4ba5329939c7d1c4318307794a544f3eb5fb3b6536210c98676'

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

      console.log(`id token: ${tokenSet.id_token ?? 'not received'}`)
      if (tokenSet.id_token !== undefined) console.log(util.inspect(decode(tokenSet.id_token, { complete: true }), false, null, true))

      const jwt = _createJwt({ sub: tokenSet.claims().sub, scope: tokenSet.scope ?? '' })

      consumer_id = tokenSet.claims().sub

      res.json({ type: 'jwt', jwt })
    }
  )

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
    console.log("UID is >>>>>> "+uid)

    const db = connectToDatabase('./db/consumer_subscribers.db3')
    const client = client_subscription.mqttinit()

    let rawBufferData = Buffer.from(data)
    let data_sent = rawBufferData.length
    npProvider = new nonRepudiationLibrary.NonRepudiationProtocol.NonRepudiationOrig(dataExchangeAgreement, privateJwk, data, providerDltSigningKeyHex)
    const poo = await npProvider.generatePoO()
    
    const response_data = {block_id: block_id, cipherblock: npProvider.block.jwe, poO: poo}
    block_id = block_id + 1
    let sql = 'SELECT * FROM consumer_subscribers WHERE DataSourceUid=?'
    db.serialize(function(){
      db.all(sql, [uid], (err, rows) => {
          if (err) {
           console.log(err);
          }       
          rows.forEach(function(item){
          	client.publish('/to/'+item.ConsumerDid+'/'+item.DataSourceUid, JSON.stringify(response_data))
            const ammount_of_data_received = Number(item.AmmountOfDataReceived) + data_sent
            const sub_id = item.SubId
            saveAmmountOfDataSent(ammount_of_data_received, sub_id, db)
          })
      });
    })
    res.status(200).send({ msg: 'Data sent to broker' })

  } catch (error) {
    if(error instanceof Error){
                console.log(`${error.message}`)
                res.status(500).send({name: `${error.name}`, message: `${error.message}`})
            }
  }

})

router.post('/protected', passport.authenticate('digest', { session: false }),
  (req, res) => {
    console.log(req.body)
    res.json({ msg: 'Do you think we\'re done?! Put yourself to work, you loser!' })
  }
)

router.get('/streamingAccountReport/:sub_id', (req, res) => {
  try {
    const sub_id = String(req.params.sub_id)
    const report = streamingAccountReport(sub_id, res)
  } catch (error) {
    if(error instanceof Error){
      console.log(`${error.message}`)
      res.status(500).send({name: `${error.name}`, message: `${error.message}`})
  }
  }
})

router.post('/accountDataBlock/:consumer_id/:block_id', (req, res) => {
  try {
    const consumer_id = String(req.params.consumer_id)
    const block_id = String(req.params.block_id)
    const report = accountDataBlock(consumer_id, block_id, res)
  } catch (error) {
    if(error instanceof Error){
      console.log(`${error.message}`)
      res.status(500).send({name: `${error.name}`, message: `${error.message}`})
  }
  }
})

router.post('/createInvoice', (req, res) => {
  try {
    let fromDate = req.body.fromDate
    let toDate = req.body.toDate
    const db = connectToDatabase('./db/provider.db3')
    countBlocks(db, common.x, fromDate, toDate, res, consumer_id)
    console.log(toDate)
  } catch (error) {
    if(error instanceof Error){
      console.log(`${error.message}`)
      res.status(500).send({name: `${error.name}`, message: `${error.message}`})
  }
  }
})

router.post('/validatePoR', async(req, res) => {
  try {
    const por = req.body.por
    const pop = await common.validateProofOfReception(por, npProvider)
    common.NRPcompletenessCheck(npProvider)
    res.status(200).send({pop: pop})
    
  } catch (error) {
    if(error instanceof Error){
      console.log(`${error.message}`)
      res.status(500).send({name: `${error.name}`, message: `${error.message}`})
  }
  }
})

router.post('/regds', passport.authenticate('digest', { session: false }), (req, res) => {
  try {
    const Uid = req.body.uid
    const Description = req.body.description
    const URL = req.body.url
    const Action = req.body.action
    const Timestamp = common.getTimestamp()

    if(Action === 'register'){
      writeRegisteredDataSource(Uid, Description, URL, Timestamp)
      console.log('Datasource added to the database')
      res.status(200).send('OK')
    }
    if(Action === 'unregister'){
      deleteSubscriptionToDataSource(Uid)
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
      console.log('request body', req.body);

      const resource_name = req.params.data;
      id = await req.body['block_id'];
      const ACK = await req.body['block_ack'];
      const resource_map_path = `./data/${resource_name}.json`
      const resource_path = `./data/${resource_name}`

      if (fs.existsSync(resource_path)) {
          console.log('The resource exists')

          if (id == 'null'){
              const check = common.checkFile(resource_map_path, resource_path);
              console.log('File checked')

          }
          var map = fs.readFileSync(resource_map_path, 'utf8');
          let obj = JSON.parse(map);

          if (id === 'null' && ACK === 'null'){
              let index = Object.keys(obj.records[0])
              console.log(`Response is "block_id": "null", "data": "null", "next_block_id": ${index[0]}`);
              res.send({"block_id": "null", "next_block_id": `${index[0]}`, "poo": "null", "cipherblock": "null"});
          }else if (id != 'null' && ACK == 'null') {
            try {
              let response: any = await common.responseData(id, obj, resource_path);
              let rawBufferData = Buffer.from(response.data)
              console.log('BUFEER: ' + rawBufferData.length)

              npProvider = new nonRepudiationLibrary.NonRepudiationProtocol.NonRepudiationOrig(dataExchangeAgreement, privateJwk, rawBufferData, providerDltSigningKeyHex)
              const poo = await npProvider.generatePoO()
              //this needs a change
              delete response['data']
              response['poo'] = poo
              response['cipherblock'] = npProvider.block.jwe
              res.send(response)
            } catch (error) {
              if(error instanceof Error){
                console.log(`${error.message}`)
                res.status(500).send({name: `${error.name}`, message: `${error.message}`})
              }
            }
          } else if ((id != 'null') && (ACK != 'null')){
            try {
              let response: any = await common.responseData(id, obj, resource_path);
              let rawBufferData = Buffer.from(response.data)
              console.log('BUFEER: ' + rawBufferData.length)
              npProvider = new nonRepudiationLibrary.NonRepudiationProtocol.NonRepudiationOrig(dataExchangeAgreement, privateJwk, rawBufferData, providerDltSigningKeyHex)
              const poo = await npProvider.generatePoO()

              delete response['data']
              response['poo'] = poo
              response['cipherblock'] = npProvider.block.jwe
              res.send(response)
            } catch (error) {
              if(error instanceof Error){
                console.log(`${error.message}`)
                res.status(500).send({name: `${error.name}`, message: `${error.message}`})
              }
            }
          } else if ((id == 'null') && (ACK != 'null')){
              res.send({"block_id": "null", "next_block_id": "null", "poo": "null", "cipherblock": "null"});
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

export function getNpProvider(){
  return npProvider
}

export function getConsumerId(){
  return consumer_id
}

export function getBlockId(){
  return block_id
}