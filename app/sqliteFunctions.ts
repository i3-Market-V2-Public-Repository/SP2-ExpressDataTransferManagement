import * as sqlite3  from 'sqlite3';
import * as path from 'path'

const DigestFetch = require('digest-fetch');

// Load environment variables
const dotenv = require('dotenv').config({ path: path.resolve(__dirname, '../.env') })
let block_size = Number(process.env.BLOCK_SIZE) || 256;

// Variables for invoice response to client (hardcoded for now)
let BlockPrice:number = 0.156
let VAT:number = 21
let CompanyName:string = 'Siemens'
let ContractID:string = '0x388FbEd8b353D81769a4585TFc271A6302D45f20'

let report = {
    consumer_id: String,
    data_source_uid: String,
    sub_id: String,
    timestamp: String,
    ammount_of_data_received: 'test'
}

export function connectToDatabase (pathToDb: string){
    let db = new sqlite3.Database(pathToDb, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE
    , (err) => {
        if (err) {
            console.error(err.message);
        } else {
            console.log('Connected to database '+pathToDb);
        }
    });
    return db
}

export function addDataSpaceUser (user, password) {

    let db = connectToDatabase('./db/data_space_users.db3')

    db.prepare('CREATE TABLE IF NOT EXISTS data_space_users(user TEXT, password TEXT);', function(err) {
        if (err) {
            console.log(err.message)
        }
    console.log('Check if table data_space_users exists before adding new users')}).run().finalize();

    console.log("User => "+user+" Password => "+password)
    
    let select = 'SELECT * FROM data_space_users WHERE user=?'
    let insert = 'INSERT into data_space_users(user, password) VALUES (?, ?)'
    db.serialize(function(){
        db.all(select, [user], (err, rows) => {
                if (err) {
                 console.log(err)
                }else if(rows.length == 0){
                    db.run(insert, [user, password], (err) => {
                        if (err) {
                         console.log(err)
                        }
                        db.close();
                    });
                }
            });
        })
}

exports.findByUsername = function(username, cb) {
    process.nextTick(function() {
        let db = connectToDatabase('./db/data_space_users.db3')
        let sql = 'SELECT * FROM data_space_users where user = ?'

        db.serialize(function(){
            db.all(sql, [username], (err, rows) => {
                if (err) {
                 console.log(err)
                }else if(rows.length > 0){
                    var record = rows[0]
                    return cb(null, record)
                }else {
                    return cb(null, null);
                }
            });
        })
        db.close()
    });
  }

// Add broker subscribers to database
export function addSubscriberToDatabase(ConsumerDid, DataSourceUid, Timestamp, SubId, AmmountOfDataReceived){
  
    let db = connectToDatabase('./db/consumer_subscribers.db3')
    let sql = 'SELECT * FROM consumer_subscribers where ConsumerDid =? AND DataSourceUid=?'
  
    db.serialize(() => {
  
    db.prepare('CREATE TABLE IF NOT EXISTS consumer_subscribers(ConsumerDid TEXT, DataSourceUid TEXT, Timestamp TEXT, SubId TEXT, AmmountOfDataReceived TEXT);', function(err) {
        if (err) {
            console.log(err.message)
        }
        console.log('Check if table consumer_subscribers exists before adding subscriber')}).run().finalize();
    console.log("ConsumerDid => "+ConsumerDid+" DataSourceUid => "+DataSourceUid+" Timestamp => "+Timestamp + " SubId => "+SubId+" AmmountOfDataReceived =>"+AmmountOfDataReceived)
    db.serialize(function(){
      db.all(sql, [ConsumerDid,DataSourceUid], (err, rows) => {
      if (err) {
      console.log(err)
      }
      if(rows.length == 0){
          db.run('INSERT into consumer_subscribers(ConsumerDid, DataSourceUid, Timestamp, SubId, AmmountOfDataReceived) VALUES (?, ?, ?, ?, ?)', [ConsumerDid, DataSourceUid, Timestamp, SubId, AmmountOfDataReceived], function(err, row){
              if(err){
                  console.log(err.message)
              }
              console.log(ConsumerDid + " added to database")
              db.close();
          })
      }
      });
    })
    })
  }

export function saveAmmountOfDataSent(ammount_of_data_received, sub_id, db) {

    db.run('UPDATE consumer_subscribers SET AmmountOfDataReceived=? WHERE SubId=?', [ammount_of_data_received, sub_id], function(err){
        if(err){
            console.log(err.message)
        }
        db.close();
    })
}

export async function streamingAccountReport(sub_id, res) {

    let db = connectToDatabase('./db/consumer_subscribers.db3')
    let sql = 'SELECT * FROM consumer_subscribers WHERE SubId=?'
    db.all(sql, [sub_id], (err, row) => {
        if(err){
            console.log(err.message)
        }
        if (row.length != 0) {
            report.consumer_id = row[0].ConsumerDid
            report.data_source_uid = row[0].DataSourceUid
            report.sub_id = row[0].SubId
            report.timestamp = row[0].Timestamp
            report.ammount_of_data_received = row[0].AmmountOfDataReceived
            res.status(200).send(report)
        } else {
            res.status(200).send({msg: `Consumer with subscription id ${sub_id} not found`})
        }
        db.close();
    })
}

// Delete subscription from database
export function deleteConsumerSubscription (ConsumerDid, DataSourceUid){
  
      let db = connectToDatabase('./db/consumer_subscribers.db3')
  
      db.serialize(() => {
          db.run('DELETE FROM consumer_subscribers WHERE ConsumerDid=? AND DataSourceUid=?', ConsumerDid, DataSourceUid, function(err, row){
          console.log("Subscriber removed from database")
        if(err){
            console.log(err.message)
        }
    })
        db.close();
      })
  }

// Delete subscription from database
export function deleteSubscriptionToDataSource (Uid){

	let db = connectToDatabase('./db/data_sources.db3')
	db.serialize(() => {
		db.run('DELETE FROM data_sources WHERE Uid=?', Uid, function(err, row){
      if(err){
          console.log(err.message)
      }
  })
      db.close();
	})
}

// Write registered datasources to database
export function writeRegisteredDataSource(Uid, Description, URL, Timestamp){
  
    let db = connectToDatabase('./db/data_sources.db3')
    
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

  // Function that returns the URL of the subscibed data source
export function start_or_end_stream(dataSourceUid,action){
    try {
    let db = connectToDatabase('./db/data_sources.db3')
    let sql = 'SELECT * FROM data_sources where Uid = ?'
    db.serialize(function(){
        db.all(sql, [dataSourceUid], (err, rows) => {
            if (err) {
             console.log(err)
            }else if(rows.length > 0){
                rows.forEach(async(row) => {
                    const url = row.URL
                    console.log('The Url is ' + url)
                    const client = new DigestFetch('admin', 'admin') 
                    let resource = await client.fetch(`${url}/${action}`, {
                    method: 'GET',
                    })
                    console.log('Called endpoint: ' + `${url}/${action}`)
                    const isSent = await resource.json();
                    console.log(isSent)
            })
            }
        });
    })
    db.close()
    } catch (error) {
        console.log(error)
    }
  }

// Write proofs to database
export function saveProofs(Timestamp, ConsumerID, BlockID, PoO, PoR, PoP){

    let db = connectToDatabase('./db/proofs.db3')
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

export function accountDataBlock(consumer_id, block_id, res) {

    let db = connectToDatabase('./db/proofs.db3')
    let sql = 'SELECT * FROM accounting WHERE ConsumerID=? AND BlockID=?'
    db.all(sql, [consumer_id, block_id], (err, rows) => {
        if(err){
            console.log(err.message)
        }
        if (rows.length != 0) {
            console.log(rows)
            res.status(200).send(rows)
        } else {
            res.status(200).send({msg: `Consumer with id ${consumer_id} for block ${block_id} not found`})
        }
        db.close();
    })
}
// Function that returns the total ammount the client has to pay
export function countBlocks(db, callback, fromDate, toDate, res, ConsumerID){
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
