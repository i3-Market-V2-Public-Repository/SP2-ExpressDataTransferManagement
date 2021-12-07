import * as mqtt from 'mqtt'
import * as sqlite3  from 'sqlite3';
import { validateProofOfReception } from '../routes/index';

const options = {
    clientId: "data-access-api3",
    username: "DataAccessApi3",
    password: "pa$$w0rd",
    clean: false
};
var isConnected = false
var client:mqtt.MqttClient

function connectToDatabase (pathToDb: string){
    let db = new sqlite3.Database(pathToDb, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE
    , (err) => {
        if (err) {
            console.error(err.message);
        } else {
            console.log('Connected to database.');
        }
    });
    return db
  }

// Write proofs to database
function writeToDatabase(ConsumerDid, DataSourceUid, Timestamp){
  
  var db = connectToDatabase('./db/consumer_subscribers.db3')
  
  db.serialize(() => {

  db.prepare('CREATE TABLE IF NOT EXISTS consumer_subscribers(ConsumerDid TEXT, DataSourceUid TEXT, Timestamp TEXT);', function(err) {
      if (err) {
          console.log(err.message)
      }
      console.log('Table created')}).run().finalize();
  console.log("ConsumerDid => "+ConsumerDid+" DataSourceUid => "+DataSourceUid+" Timestamp => "+Timestamp)
  db.run('INSERT into consumer_subscribers(ConsumerDid, DataSourceUid, Timestamp) VALUES (?, ?, ?)', [ConsumerDid, DataSourceUid, Timestamp], function(err, row){
      if(err){
          console.log(err.message)
      }
      console.log("Entry added to the table")
  })
      db.close();
  })
}

function deleteSubscribtion (ConsumerDid, DataSourceUid){

	var db = connectToDatabase('./db/consumer_subscribers.db3')
	db.serialize(() => {
		db.run('DELETE FROM consumer_subscribers WHERE ConsumerDid=? AND DataSourceUid=?', ConsumerDid, DataSourceUid, function(err, row){
      if(err){
          console.log(err.message)
      }
  })
      db.close();
	})
}

// Function that returns the URL of the subscibed data source
function startStream(dataSourceUid){
    try {
    var db = connectToDatabase('./db/data_sources.db3')
    let sql = 'SELECT * FROM data_sources where Uid = ?'
    db.serialize(function(){
        db.all(sql, [dataSourceUid], (err, rows) => {
            if (err) {
             console.log(err)
            }
            rows.forEach(async(row) => {
                const url = row.URL
                console.log('The Url is ' + url)
                let resource = await fetch(`${url}/start`, {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                },
                })
                const isSent = await resource.json();
            })
        });
    })
    db.close()
    console.log('Stream started')
    } catch (error) {
        console.log(error)
    }
  }
function subscribe(client:mqtt.MqttClient) {

let words: string[]

client.on('connect', function () {
  //client.subscribe('$SYS/broker/log/#', {qos: 2})
})

client.on('error', function() {
    console.log('Error')
})
client.on('message', function (topic, message) {
  
  console.log('Inside on message')
  console.log(topic + " " + message.toString())
  words = message.toString().split(' ');
  
  if(topic.endsWith("$SYS/broker/log/M/subscribe") && words[3].startsWith("/to/" + words[1])){

    const topicSplit = words[3].split('/')
    const consumerDid = topicSplit[2]
    const dataSourceUid = topicSplit[3]
    const fromTopic = `${consumerDid}` + `/${dataSourceUid}`
  	writeToDatabase(consumerDid, dataSourceUid, words[0].replace(':', ''))
  	console.log(consumerDid + " subscribed!")

    client.subscribe('/from/'+fromTopic,{qos: 2})

    client.on('message', function(topic, message) {
        //console.log(topic + " " + message.toString())
        //console.log(proofOfOrigin.proof)
        if (topic.startsWith('/from/')){
        client.publish('/to/'+fromTopic,'NRP')
        }
    })
  	// Call start endpoint
  }

  if(topic.endsWith("$SYS/broker/log/M/unsubscribe") && words[2].startsWith("/to/" + words[1])){
    
    const topicSplit = words[2].split('/')
    const dataSourceUid = topicSplit[3]
    deleteSubscribtion(words[1], dataSourceUid)
    console.log(words[1] + " unsubscribed!")
}
})
return "Subscribed to $SYS/broker/log/#"
}

function mqttinit(){
    if (isConnected == false) { 
        console.log("Connecting...\n")
        client  = mqtt.connect('mqtt://mqtt-broker:1883', options)
    }
    return client
}

function mqttprocess(client){

    let words: string[]

    client.on('connect', function () {
        isConnected = true
	    console.log("Connected\n")
        client.subscribe('$SYS/broker/log/#')
    })

    client.on('message', function (topic, message) {
        console.log(">> "+topic +" " +message.toString())
        words = message.toString().split(' ');
  
        if(topic.endsWith("$SYS/broker/log/M/subscribe") && words[3].startsWith("/to/" + words[1])){

            const topicSplit = words[3].split('/')
            const consumerDid = topicSplit[2]
            const dataSourceUid = topicSplit[3]
            const fromTopic = `${consumerDid}` + `/${dataSourceUid}`
  	        writeToDatabase(consumerDid, dataSourceUid, words[0].replace(':', ''))
  	        console.log(consumerDid + " subscribed!")

            client.subscribe('/from/'+fromTopic,{qos: 2})

            client.on('message', async function(topic, message) {
                //console.log(topic + " " + message.toString())
                if (topic.startsWith('/from/')){
                    const poP = await validateProofOfReception(message.toString())
                    client.publish('/to/'+fromTopic, JSON.stringify(poP))
                }
            })
  	        startStream(dataSourceUid)
        }

        if(topic.endsWith("$SYS/broker/log/M/unsubscribe") && words[2].startsWith("/to/" + words[1])){
    
            const topicSplit = words[2].split('/')
            const dataSourceUid = topicSplit[3]
            deleteSubscribtion(words[1], dataSourceUid)
            console.log(words[1] + " unsubscribed!")
        }
    })
}

export default { subscribe, mqttinit, mqttprocess }
