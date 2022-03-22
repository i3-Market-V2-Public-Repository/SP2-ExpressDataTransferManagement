import * as mqtt from 'mqtt';
import * as sqlite_functions from '../sqliteFunctions';
import * as common from '../commom';
import * as nrp from '../routes/index';

const options = {
    clientId: "data-access-api3",
    username: "DataAccessApi3",
    password: "pa$$w0rd",
    clean: false
};
var isConnected = false
var client:mqtt.MqttClient

function mqttinit(){
    if (isConnected == false) { 
        console.log("Connecting...\n")
        client  = mqtt.connect('mqtt://mqtt-broker:1883', options)
    }
    return client
}

function mqttprocess(client){

    let message_split: string[]
    let topic_split
    let consumerDid
    let dataSourceUid
    let timestamp
    let topic_subscribed_to
    let topic_unsubscribed_to
    let sub_id = 0
    let ammount_of_data_received = 0
    
    client.on('connect', function () {
        isConnected = true
	    console.log("Connected\n")
        client.subscribe('$SYS/broker/log/#')
    })

    client.on('message', async function (topic, message) {

        console.log(">>>>> "+topic +" " +message.toString())

        if (topic.startsWith("$SYS/broker/log/M/subscribe")) {

            message_split = message.toString().split(' ');
            topic_subscribed_to = message_split[3]
            timestamp = message_split[0]
            topic_split = message_split[3].split('/')
            consumerDid = topic_split[2]
            dataSourceUid = topic_split[3]
        }

        if (topic.startsWith("$SYS/broker/log/M/unsubscribe")) {

            message_split = message.toString().split(' ');
            topic_unsubscribed_to = message_split[2]
            topic_split = message_split[2].split('/')
            consumerDid = topic_split[2]
            dataSourceUid = topic_split[3]
        }

        if(topic.startsWith("$SYS/broker/log/M/subscribe") && topic_subscribed_to.startsWith("/to/" + consumerDid)){

            client.subscribe('/from/'+`${consumerDid}` + `/${dataSourceUid}`)
   
            sqlite_functions.addSubscriberToDatabase(consumerDid, dataSourceUid, timestamp.replace(':', ''), sub_id, ammount_of_data_received)
            sub_id = sub_id + 1
            const action = "subscribe"

  	        sqlite_functions.start_or_end_stream(dataSourceUid, action)
        }

        if(topic.startsWith("$SYS/broker/log/M/unsubscribe") && topic_unsubscribed_to.startsWith("/to/" + consumerDid)){
            
            sqlite_functions.deleteConsumerSubscription(consumerDid, dataSourceUid)
            client.unsubscribe('/from/'+`${consumerDid}` + `/${dataSourceUid}`)
            const action = "unsubscribe"
            
            sqlite_functions.start_or_end_stream(dataSourceUid, action)
            console.log(consumerDid + " unsubscribed!")

        }
        // Response to client logic here
        if (topic.startsWith('/from/')){
            let npProvider = nrp.getNpProvider()
            let por = JSON.parse(message.toString())
            const poP = await common.validateProofOfReception(por, npProvider)
            //common.NRPcompletenessCheck(npProvider)
            client.publish('/to/'+`${consumerDid}` + `/${dataSourceUid}`, JSON.stringify(poP))
        }

    })
}

export default { mqttinit, mqttprocess }
