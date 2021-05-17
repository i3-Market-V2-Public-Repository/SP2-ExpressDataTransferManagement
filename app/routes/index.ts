'use strict'

import util from 'util'
import express, { RequestHandler } from 'express'
import passportPromise from '../passport'
import jwt, { decode } from 'jsonwebtoken'
import config from '../config'
import { TokenSet } from 'openid-client'
/*1###################################################################*/
import fs from 'fs'
import crypto from 'crypto'
import bodyParser from 'body-parser'
import winston from 'winston'
import path from 'path'
/*1###################################################################*/
const router = express.Router()

interface JwtClaims {
  sub: string
  scope: string
}
/*2###################################################################*/
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

// environment variables
const dotenv = require('dotenv').config({ path: path.resolve(__dirname, '../.env') })
let block_size = Number(process.env.BLOCK_SIZE) || 128;
router.use(bodyParser.json());
/*2###################################################################*/
export default async (): Promise<typeof router> => {
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

      res.json({ type: 'jwt', jwt })
    }
  )
/*3###################################################################*/
// get file size in bytes
function getFilesizeInBytes(filename : string) {
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

  var data = fs.readFileSync(resource_map_path, 'utf-8');
  let obj = JSON.parse(data);
  let hash = '';
  var index = 0;
  while(index < (nr_of_blocks*block_size)){
      var buffer = Buffer.alloc(block_size);
      fs.readSync(fd, buffer, 0, block_size, index)
      let content = buffer.toString('hex', 0)
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
async function responseData(ID : string, obj: any, resource_path : string){
  let block = block_size
  // get index of ID
  let keys: string[] = []
  for(let i = 0; i < obj.records.length; i++){
      keys[i] = Object.keys(obj.records[i])[0]
  }
  let getIndex = keys.indexOf(ID);
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
              let content = buffer.toString('base64', 0, num)
              if (getIndex + 1 == keys.length){
              resolve({"block_id": `${ID}`, "data": `${content}`, "next_block_id":"null"});
              }else{
              resolve({"block_id": `${ID}`, "data": `${content}`, "next_block_id":`${keys[getIndex+1]}`})
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
/*3###################################################################*/
  // router.get('/protected', passport.authenticate('jwtBearer', { session: false }),
  //   (req, res) => {
  //     res.json({ msg: 'Do you think we\'re done?! Put yourself to work, you loser!' })
  //   }
  // )
/*4###################################################################*/
router.post('/:data', passport.authenticate('jwtBearer', { session: false }),
async(req, res) => {
  try {
      logger.info('request body', req.body);

      const resource_name = req.params.data;
      const ID = await req.body['block_id'];
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
              res.send({"block_id": "null", "data": "null", "next_block_id": `${index[0]}`});
          }else if (ID != 'null' && ACK == 'null') {
              let response = await responseData(ID, obj, resource_path);
              logger.info('response data', response)
              res.send(response)
          } else if ((ID != 'null') && (ACK != 'null')){
              let response = await responseData(ID, obj, resource_path);
              logger.info('response data', response)
              res.send(response)
          } else if ((ID == 'null') && (ACK != 'null')){
              res.send({"block_id": "null", "data": "null", "next_block_id": "null"});
          }
      }else{
          res.sendStatus(404);
      }
      }catch(e) {
          res.sendStatus(500);
  }
});
/*4###################################################################*/
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
