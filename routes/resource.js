const express = require("express");
const router = express.Router();

const crypto = require('crypto');
var bodyParser = require('body-parser');
var fs = require('fs');
const path = require('path');
const winston = require('winston');

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
let block_size = parseInt(process.env.BLOCK_SIZE) || 128;

router.use(bodyParser.json());

// get file size in bytes
function getFilesizeInBytes(filename) {
    var stats = fs.statSync(filename);
    var fileSizeInBytes = stats.size;
    logger.info(`File size is ${fileSizeInBytes} bytes`)
    return fileSizeInBytes;
}

// check if file exists, if it doesn't create it and append structure
function checkFile(resource_map_path, resource_path){
    try{
        fs.accessSync(resource_map_path, fs.F_OK);
        logger.info('Map already exists');
    }catch (e){
        const data = '{"records":[]}'
        const create = fs.appendFileSync(resource_map_path, data);
        mapData(resource_map_path, resource_path);
    }
}
// map offset to ID
function mapData(resource_map_path, resource_path){
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
async function responseData(ID, obj, resource_path){
    let block = block_size
    // get index of ID
    let keys = []
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

/**
 * @swagger
 * tags:
 *   name: DataTransferManagement
 *   description: The data transfer managing API
 */

/**
 * @swagger
 * /resource/{data}:
 *   post:
 *     summary: Get the block of data by giving the resource name, block_id, block_ack
 *     tags: [Resource]
 *     parameters:
 *       - in: path
 *         name: data
 *         schema:
 *           type: string
 *         required: true
 *         description: The resource name.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: 
 *             type: object
 *             required:
 *               - block_id
 *               - block_ack
 *             properties:
 *               block_id:
 *                 type: string
 *               block_ack:
 *                 type: string
 *     responses:
 *       200:
 *         description: Response that contains the block id, the data block and the next block id.
 *       404:
 *         description: File not found.
 *       500:
 *         description: Internal server error.
 */
router.post('/:data', async(req, res) => {
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

module.exports = router;