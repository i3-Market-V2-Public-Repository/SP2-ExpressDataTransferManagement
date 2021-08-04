'use strict';
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.responseData = exports.getFilesizeInBytes = void 0;
const util_1 = __importDefault(require("util"));
const express_1 = __importDefault(require("express"));
const passport_1 = __importDefault(require("../passport"));
const jsonwebtoken_1 = __importStar(require("jsonwebtoken"));
const config_1 = __importDefault(require("../config"));
const sqlite3_1 = __importDefault(require("sqlite3"));
const fs_1 = __importDefault(require("fs"));
const crypto_1 = __importDefault(require("crypto"));
const body_parser_1 = __importDefault(require("body-parser"));
const winston_1 = __importDefault(require("winston"));
const path_1 = __importDefault(require("path"));
const nonRepudiationProofs = __importStar(require("@i3-market/non-repudiation-proofs"));
const parse_1 = __importDefault(require("jose/jwk/parse"));
require('isomorphic-fetch');
const router = express_1.default.Router();
// Load environment variables
const dotenv = require('dotenv').config({ path: path_1.default.resolve(__dirname, '../.env') });
let block_size = Number(process.env.BLOCK_SIZE) || 256;
router.use(body_parser_1.default.json());
// Logger configuration
const logConfiguration = {
    'transports': [
        new winston_1.default.transports.File({
            filename: './logs/server.log'
        })
    ]
};
// Create logger
const logger = winston_1.default.createLogger(logConfiguration);
// Variables for invoice response to client (hardcoded for now)
let BlockPrice = 0.156;
let VAT = 21;
let CompanyName = 'Siemens';
let ContractID = '0x388FbEd8b353D81769a4585TFc271A6302D45f20';
// Variables to temporary store proofs until they are added to database
let secret;
let proof;
let ID = "ID";
let ProviderID;
let PoO;
let PoR;
let ConsumerID;
exports.default = async () => {
    //Load Keys from json files
    let privateKeyStrProvider = fs_1.default.readFileSync('./keys/privateKeyProvider.json', { encoding: 'utf-8', flag: 'r' });
    let publicKeyStrProvider = fs_1.default.readFileSync('./keys/publicKeyProvider.json', { encoding: 'utf-8', flag: 'r' });
    let publicKeyStrConsumer = fs_1.default.readFileSync('./keys/publicKeyConsumer.json', { encoding: 'utf-8', flag: 'r' });
    const privateKeyProvider = await parse_1.default(JSON.parse(privateKeyStrProvider), 'ES256');
    const publicKeyProvider = await parse_1.default(JSON.parse(publicKeyStrProvider), 'ES256');
    const publicKeyConsumer = await parse_1.default(JSON.parse(publicKeyStrConsumer), 'ES256');
    /**
     * CORS
     */
    const cors = (req, res, next) => {
        res.header('Access-Control-Allow-Origin', config_1.default.api.allowedOrigin);
        res.header('Access-Control-Allow-Headers', 'Authorization, Content-Type');
        res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.header('Allow', 'GET, POST, OPTIONS');
        next();
    };
    const passport = await passport_1.default();
    router.use(cors);
    router.get('/oidc/login/provider', passport.authenticate('oidc', { scope: 'openid vc vce:provider' }));
    router.get('/oidc/login/consumer', passport.authenticate('oidc', { scope: 'openid vc vce:consumer' }));
    router.get('/oidc/cb', passport.authenticate('oidc', { session: false }), function (req, res) {
        if (req.user === undefined)
            throw new Error('token not received');
        const tokenSet = req.user;
        console.log(`Access token: ${tokenSet.access_token ?? 'not received'}`);
        if (tokenSet.access_token !== undefined)
            console.log(util_1.default.inspect(jsonwebtoken_1.decode(tokenSet.access_token, { complete: true }), false, null, true));
        console.log(`ID token: ${tokenSet.id_token ?? 'not received'}`);
        if (tokenSet.id_token !== undefined)
            console.log(util_1.default.inspect(jsonwebtoken_1.decode(tokenSet.id_token, { complete: true }), false, null, true));
        const jwt = _createJwt({ sub: tokenSet.claims().sub, scope: tokenSet.scope ?? '' });
        ConsumerID = tokenSet.claims().sub;
        res.json({ type: 'jwt', jwt });
    });
    //Function that creates proof of origin
    let proofOfOrigin = async (block_id, block) => {
        const exchangeID = block_id;
        const jwk = await nonRepudiationProofs.createJwk();
        secret = jwk;
        ProviderID = 'urn:example:provider';
        const poO = await nonRepudiationProofs.createPoO(privateKeyProvider, toArrayBuffer(block), ProviderID, ConsumerID, exchangeID, block_id, jwk);
        proof = poO;
        return poO;
    };
    // Checks if auth is working
    router.get('/protected', passport.authenticate('jwtBearer', { session: false }), (req, res) => {
        res.json({ msg: 'Do you think we\'re done?! Put yourself to work, you loser!' });
    });
    // Invoice call that returns a detailed response about how much the client has to pay
    router.post('/createInvoice', (req, res) => {
        let fromDate = req.body.fromDate;
        let toDate = req.body.toDate;
        const db = connectToDatabase();
        countBlocks(db, x, fromDate, toDate, res);
        console.log(toDate);
    });
    // Method that verifies if proof of reception is valid and if it is, a hash is sent to Auditable Accounting
    // in order to receive a proof of publication
    router.post('/validatePoR', async (req, res) => {
        console.log("The poO is" + proof['poO']);
        const validPoR = await nonRepudiationProofs.validatePoR(publicKeyConsumer, req.body.poR, proof['poO']);
        if (validPoR === true) {
            console.log(secret);
            PoR = req.body.poR;
            PoO = proof['poO'];
            const jsonObject = `{ ${ID}: { PoO: ${PoO}, PoR: ${PoR} } }`;
            const hash = crypto_1.default.createHash('sha256').update(jsonObject).digest('hex');
            console.log("The hash is: " + hash);
            let resource = await fetch(`http://95.211.3.244:8090/registries`, {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ "dataHash": `${hash}` }),
            })
                .catch((error) => {
                console.error('Error:', error);
            });
            const PoP = await resource.json();
            console.log(JSON.stringify(PoP));
            const db = connectToDatabase();
            const Timestamp = getTimestamp();
            writeToDatabase(db, Timestamp, ConsumerID, ID, PoO, PoR, JSON.stringify(PoP));
            res.jsonp({ "jwk": secret, "poP": PoP });
        }
        else {
            res.json({ msg: 'Invalid proof of reception' });
        }
    });
    router.post('/:data', passport.authenticate('jwtBearer', { session: false }), async (req, res) => {
        try {
            logger.info('request body', req.body);
            const resource_name = req.params.data;
            ID = await req.body['block_id'];
            const ACK = await req.body['block_ack'];
            const resource_map_path = `./data/${resource_name}.json`;
            const resource_path = `./data/${resource_name}`;
            if (fs_1.default.existsSync(resource_path)) {
                logger.info('The resource exists');
                if (ID == 'null') {
                    const check = checkFile(resource_map_path, resource_path);
                    logger.info('File checked');
                }
                var map = fs_1.default.readFileSync(resource_map_path, 'utf8');
                let obj = JSON.parse(map);
                //get the data that matches the ID given by the client id
                if (ID === 'null' && ACK === 'null') {
                    let index = Object.keys(obj.records[0]);
                    logger.info(`Response is "block_id": "null", "data": "null", "next_block_id": ${index[0]}`);
                    res.send({ "block_id": "null", "next_block_id": `${index[0]}`, "cipherblock": "null", "poO": "null" });
                }
                else if (ID != 'null' && ACK == 'null') {
                    let response = await responseData(ID, obj, resource_path);
                    let rawBufferData = Buffer.from(response.data);
                    console.log('BUFEER: ' + rawBufferData.length);
                    proofOfOrigin(parseInt(ID), rawBufferData).then(proof => {
                        console.log(proof);
                        delete response['data'];
                        const response_data = Object.assign(response, proof);
                        console.log(response_data);
                        let ciphertext = async () => {
                            nonRepudiationProofs.decryptCipherblock(response_data.cipherblock, secret).then(o => { console.log(o); });
                        };
                        ciphertext();
                        res.send(response_data);
                    });
                }
                else if ((ID != 'null') && (ACK != 'null')) {
                    let response = await responseData(ID, obj, resource_path);
                    let rawBufferData = Buffer.from(response.data);
                    console.log('BUFEER: ' + rawBufferData.length);
                    proofOfOrigin(parseInt(ID), rawBufferData).then(proof => {
                        delete response['data'];
                        const response_data = Object.assign(response, proof);
                        res.send(response_data);
                    });
                }
                else if ((ID == 'null') && (ACK != 'null')) {
                    res.send({ "block_id": "null", "next_block_id": "null", "cipherblock": "null", "poO": "null" });
                }
            }
            else {
                res.sendStatus(404);
            }
        }
        catch (e) {
            res.sendStatus(500);
        }
    });
    return router;
};
function _createJwt(claims) {
    /** This is what ends up in our JWT */
    const jwtClaims = {
        iss: config_1.default.jwt.iss,
        aud: config_1.default.jwt.aud,
        exp: Math.floor(Date.now() / 1000) + 86400,
        ...claims
    };
    /** generate a signed json web token and return it in the response */
    return jsonwebtoken_1.default.sign(jwtClaims, config_1.default.jwt.secret);
}
// get file size in bytes
function getFilesizeInBytes(filename) {
    var stats = fs_1.default.statSync(filename);
    var fileSizeInBytes = stats.size;
    logger.info(`File size is ${fileSizeInBytes} bytes`);
    return fileSizeInBytes;
}
exports.getFilesizeInBytes = getFilesizeInBytes;
// check if file exists, if it doesn't create it and append structure
function checkFile(resource_map_path, resource_path) {
    try {
        fs_1.default.accessSync(resource_map_path, fs_1.default.constants.F_OK);
        logger.info('Map already exists');
    }
    catch (e) {
        const data = '{"records":[]}';
        const create = fs_1.default.appendFileSync(resource_map_path, data);
        mapData(resource_map_path, resource_path);
    }
}
// map offset to ID
function mapData(resource_map_path, resource_path) {
    const fd = fs_1.default.openSync(resource_path, 'r');
    const size = getFilesizeInBytes(resource_path);
    const nr_of_blocks = Math.ceil(size / block_size);
    logger.info(`Number of blocks: ${nr_of_blocks}`);
    var data = fs_1.default.readFileSync(resource_map_path, 'binary');
    let obj = JSON.parse(data);
    let hash = '';
    var index = 0;
    while (index < (nr_of_blocks * block_size)) {
        var buffer = Buffer.alloc(block_size);
        fs_1.default.readSync(fd, buffer, 0, block_size, index);
        let content = buffer;
        hash = crypto_1.default.createHash('sha256').update(content + hash).digest('hex');
        logger.info(`Hash of the block is ${hash}`);
        obj.records.push({ [`${hash}`]: `${index}` });
        index += block_size;
    }
    let json = JSON.stringify(obj);
    fs_1.default.writeFileSync(resource_map_path, json);
    logger.info('Map created');
}
// response formating
async function responseData(ID, obj, resource_path) {
    let block = block_size;
    // get index of ID
    let keys = [];
    for (let i = 0; i < obj.records.length; i++) {
        keys[i] = Object.keys(obj.records[i])[0];
    }
    let getIndex = keys.indexOf(ID);
    // check if you got to last block
    if (getIndex + 1 == keys.length) {
        block = getFilesizeInBytes(resource_path) % block_size;
        logger.info(`New block size is: ${block}`);
    }
    // data from coresponding offset
    let buffer = Buffer.alloc(block);
    const promise = await new Promise((resolve) => {
        fs_1.default.open(resource_path, 'r+', function (err, fd) {
            if (err) {
                return console.error(err);
            }
            console.log("Reading the file");
            fs_1.default.read(fd, buffer, 0, block, parseInt(obj.records[getIndex][`${ID}`]), function (err, num) {
                if (err) {
                    console.log(err);
                }
                let content = buffer;
                console.log('CONTENT: ' + content.length);
                if (getIndex + 1 == keys.length) {
                    resolve({ block_id: ID, data: content, next_block_id: null });
                }
                else {
                    resolve({ block_id: ID, data: content, next_block_id: keys[getIndex + 1] });
                }
            });
            // Close the opened file. 
            fs_1.default.close(fd, function (err) {
                if (err) {
                    console.log(err);
                }
                console.log("File closed successfully");
            });
        });
    });
    return promise;
}
exports.responseData = responseData;
function toArrayBuffer(buffer) {
    return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}
// If it doesn't exist create the provider database and return the connection object
function connectToDatabase() {
    let db = new sqlite3_1.default.Database('./db/provider.db3', sqlite3_1.default.OPEN_READWRITE | sqlite3_1.default.OPEN_CREATE, (err) => {
        if (err) {
            console.error(err.message);
        }
        else {
            console.log('Connected to the provider database.');
        }
    });
    return db;
}
// Get the date that will be written in the database
function getTimestamp() {
    const currentDate = new Date();
    const dateFormat = `${currentDate.getFullYear()}` + '-' + ("0" + (currentDate.getMonth() + 1)).slice(-2) + '-' + ("0" + currentDate.getDate()).slice(-2);
    return dateFormat;
}
// Write proofs to database
function writeToDatabase(db, Timestamp, ConsumerID, BlockID, PoO, PoR, PoP) {
    db.serialize(() => {
        db.prepare('CREATE TABLE IF NOT EXISTS accounting(Date INTEGER, ConsumerID TEXT, BlockID TEXT, PoO TEXT, PoR TEXT, PoP TEXT PRIMARY KEY);', function (err) {
            if (err) {
                console.log(err.message);
            }
            console.log('Table created');
        }).run().finalize();
        console.log("Date => " + Timestamp + " ConsumerID => " + ConsumerID + " BlockID => " + BlockID + " PoO => " + PoO + " PoR => " + PoR + " PoP => " + PoR);
        db.run('INSERT into accounting(Date, ConsumerID, BlockID, PoO, PoR, PoP) VALUES (?, ?, ?, ?, ?, ?)', [Timestamp, ConsumerID, BlockID, PoO, PoR, PoP], function (err, row) {
            if (err) {
                console.log(err.message);
            }
            console.log("Entry added to the table");
        });
        db.close();
    });
}
// Callback function that returns the total BlockPrice
function x(rows) {
    let totalPrice = rows.length * BlockPrice;
    return totalPrice;
}
// Function that returns the total ammount the client has to pay
function countBlocks(db, callback, fromDate, toDate, res) {
    let sql = 'SELECT * FROM accounting where Date >= ? AND Date <= ?';
    db.serialize(function () {
        db.all(sql, [fromDate, toDate], (err, rows) => {
            if (err) {
                callback(err);
            }
            let totalPrice = callback(rows);
            let NumBlock = totalPrice / BlockPrice;
            res.json({ ConsumerID: `${ConsumerID}`, CompanyName: `${CompanyName}`, VAT: `${VAT}`, ContractID: `${ContractID}`, NumBlock: `${NumBlock}`, BlockSize: `${block_size}`, BlockPrice: `${BlockPrice}`, TotalAmount: totalPrice });
        });
    });
}
