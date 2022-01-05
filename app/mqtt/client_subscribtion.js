"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const mqtt = require("mqtt");
const sqlite3 = require("sqlite3");
const index_1 = require("../routes/index");
const options = {
    clientId: "data-access-api3",
    username: "DataAccessApi3",
    password: "pa$$w0rd",
    clean: false
};
var isConnected = false;
var client;
function connectToDatabase(pathToDb) {
    let db = new sqlite3.Database(pathToDb, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
        if (err) {
            console.error(err.message);
        }
        else {
            console.log('Connected to database ' + pathToDb);
        }
    });
    return db;
}
// Add broker subscribers to database
function addSubscriberToDatabase(ConsumerDid, DataSourceUid, Timestamp) {
    var db = connectToDatabase('./db/consumer_subscribers.db3');
    let sql = 'SELECT * FROM consumer_subscribers where ConsumerDid =? AND DataSourceUid=?';
    db.serialize(() => {
        db.prepare('CREATE TABLE IF NOT EXISTS consumer_subscribers(ConsumerDid TEXT, DataSourceUid TEXT, Timestamp TEXT);', function (err) {
            if (err) {
                console.log(err.message);
            }
            console.log('Check if table consumer_subscribers exists before adding subscriber');
        }).run().finalize();
        console.log("ConsumerDid => " + ConsumerDid + " DataSourceUid => " + DataSourceUid + " Timestamp => " + Timestamp);
        db.serialize(function () {
            db.all(sql, [ConsumerDid, DataSourceUid], (err, rows) => {
                if (err) {
                    console.log(err);
                }
                if (rows.length == 0) {
                    db.run('INSERT into consumer_subscribers(ConsumerDid, DataSourceUid, Timestamp) VALUES (?, ?, ?)', [ConsumerDid, DataSourceUid, Timestamp], function (err, row) {
                        if (err) {
                            console.log(err.message);
                        }
                        console.log(ConsumerDid + " added to database");
                        db.close();
                    });
                }
            });
        });
    });
}
// Delete subscription from database
function deleteSubscribtion(ConsumerDid, DataSourceUid) {
    var db = connectToDatabase('./db/consumer_subscribers.db3');
    db.serialize(() => {
        db.run('DELETE FROM consumer_subscribers WHERE ConsumerDid=? AND DataSourceUid=?', ConsumerDid, DataSourceUid, function (err, row) {
            console.log("Subscriber removed from database");
            if (err) {
                console.log(err.message);
            }
        });
        db.close();
    });
}
// Function that returns the URL of the subscibed data source
function startStream(dataSourceUid) {
    try {
        var db = connectToDatabase('./db/data_sources.db3');
        let sql = 'SELECT * FROM data_sources where Uid = ?';
        db.serialize(function () {
            db.all(sql, [dataSourceUid], (err, rows) => {
                if (err) {
                    console.log(err);
                }
                else if (rows.length > 0) {
                    rows.forEach(async (row) => {
                        const url = row.URL;
                        console.log('The Url is ' + url);
                        let resource = await fetch(`${url}/subscribe`, {
                            method: 'GET',
                        });
                        console.log('Called endpoint: ' + `${url}/subscribe`);
                        const isSent = await resource.json();
                    });
                }
            });
        });
        db.close();
    }
    catch (error) {
        console.log(error);
    }
}
function subscribe(client) {
    let words;
    client.on('connect', function () {
        //client.subscribe('$SYS/broker/log/#', {qos: 2})
    });
    client.on('error', function () {
        console.log('Error');
    });
    client.on('message', function (topic, message) {
        console.log('Inside on message');
        console.log(topic + " " + message.toString());
        words = message.toString().split(' ');
        if (topic.endsWith("$SYS/broker/log/M/subscribe") && words[3].startsWith("/to/" + words[1])) {
            const topicSplit = words[3].split('/');
            const consumerDid = topicSplit[2];
            const dataSourceUid = topicSplit[3];
            const fromTopic = `${consumerDid}` + `/${dataSourceUid}`;
            addSubscriberToDatabase(consumerDid, dataSourceUid, words[0].replace(':', ''));
            console.log(consumerDid + " subscribed!");
            client.subscribe('/from/' + fromTopic, { qos: 2 });
            client.on('message', function (topic, message) {
                //console.log(topic + " " + message.toString())
                //console.log(proofOfOrigin.proof)
                if (topic.startsWith('/from/')) {
                    client.publish('/to/' + fromTopic, 'NRP');
                }
            });
            // Call start endpoint
        }
        if (topic.endsWith("$SYS/broker/log/M/unsubscribe") && words[2].startsWith("/to/" + words[1])) {
            const topicSplit = words[2].split('/');
            const dataSourceUid = topicSplit[3];
            deleteSubscribtion(words[1], dataSourceUid);
            console.log(words[1] + " unsubscribed!");
        }
    });
    return "Subscribed to $SYS/broker/log/#";
}
function mqttinit() {
    if (isConnected == false) {
        console.log("Connecting...\n");
        client = mqtt.connect('mqtt://mqtt-broker:1883', options);
    }
    return client;
}
function mqttprocess(client) {
    let words;
    client.on('connect', function () {
        isConnected = true;
        console.log("Connected\n");
        client.subscribe('$SYS/broker/log/#');
    });
    client.on('message', function (topic, message) {
        console.log(">> " + topic + " " + message.toString());
        words = message.toString().split(' ');
        if (topic.endsWith("$SYS/broker/log/M/subscribe") && words[3].startsWith("/to/" + words[1])) {
            const topicSplit = words[3].split('/');
            const consumerDid = topicSplit[2];
            const dataSourceUid = topicSplit[3];
            const fromTopic = `${consumerDid}` + `/${dataSourceUid}`;
            addSubscriberToDatabase(consumerDid, dataSourceUid, words[0].replace(':', ''));
            client.subscribe('/from/' + fromTopic, { qos: 2 });
            client.on('message', async function (topic, message) {
                //console.log(topic + " " + message.toString())
                if (topic.startsWith('/from/')) {
                    const poP = await index_1.validateProofOfReception(message.toString());
                    client.publish('/to/' + fromTopic, JSON.stringify(poP));
                }
            });
            startStream(dataSourceUid);
        }
        if (topic.endsWith("$SYS/broker/log/M/unsubscribe") && words[2].startsWith("/to/" + words[1])) {
            const topicSplit = words[2].split('/');
            const dataSourceUid = topicSplit[3];
            deleteSubscribtion(words[1], dataSourceUid);
            console.log(words[1] + " unsubscribed!");
        }
    });
}
exports.default = { subscribe, mqttinit, mqttprocess };
