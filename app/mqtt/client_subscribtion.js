"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (_) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
exports.__esModule = true;
var mqtt = require("mqtt");
var sqlite3 = require("sqlite3");
var index_1 = require("../routes/index");
var options = {
    clientId: "data-access-api3",
    username: "DataAccessApi3",
    password: "pa$$w0rd",
    clean: false
};
var isConnected = false;
var client;
function connectToDatabase(pathToDb) {
    var db = new sqlite3.Database(pathToDb, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, function (err) {
        if (err) {
            console.error(err.message);
        }
        else {
            console.log('Connected to database ' + pathToDb);
        }
    });
    return db;
}
// Check if already subscribed
function checkIfSubscribed(ConsumerDid, DataSourceUid) {
    var db = connectToDatabase('./db/consumer_subscribers.db3');
    var response = false;
    db.prepare('CREATE TABLE IF NOT EXISTS consumer_subscribers(ConsumerDid TEXT, DataSourceUid TEXT, Timestamp TEXT);', function (err) {
        if (err) {
            console.log(err.message);
        }
        console.log('Check if table consumer_subscribers exists before checking if there are any subscribers');
    }).run().finalize();
    var sql = 'SELECT * FROM consumer_subscribers WHERE ConsumerDid=? AND DataSourceUid=?';
    db.serialize(function () {
        db.all(sql, [ConsumerDid, DataSourceUid], function (err, rows) {
            if (err) {
                console.log(err);
            }
            else if (rows.length != 0) {
                response = true;
                console.log('Consumer already subscribed');
            }
        });
    });
    return response;
}
// Add broker subscribers to database
function addSubscriberToDatabase(ConsumerDid, DataSourceUid, Timestamp) {
    var db = connectToDatabase('./db/consumer_subscribers.db3');
    var sql = 'SELECT * FROM consumer_subscribers where ConsumerDid =? AND DataSourceUid=?';
    db.serialize(function () {
        db.prepare('CREATE TABLE IF NOT EXISTS consumer_subscribers(ConsumerDid TEXT, DataSourceUid TEXT, Timestamp TEXT);', function (err) {
            if (err) {
                console.log(err.message);
            }
            console.log('Check if table consumer_subscribers exists before adding subscriber');
        }).run().finalize();
        console.log("ConsumerDid => " + ConsumerDid + " DataSourceUid => " + DataSourceUid + " Timestamp => " + Timestamp);
        db.serialize(function () {
            db.all(sql, [ConsumerDid, DataSourceUid], function (err, rows) {
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
    db.serialize(function () {
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
function start_or_end_stream(dataSourceUid, action) {
    try {
        var db = connectToDatabase('./db/data_sources.db3');
        var sql_1 = 'SELECT * FROM data_sources where Uid = ?';
        db.serialize(function () {
            var _this = this;
            db.all(sql_1, [dataSourceUid], function (err, rows) {
                if (err) {
                    console.log(err);
                }
                else if (rows.length > 0) {
                    rows.forEach(function (row) { return __awaiter(_this, void 0, void 0, function () {
                        var url, resource, isSent;
                        return __generator(this, function (_a) {
                            switch (_a.label) {
                                case 0:
                                    url = row.URL;
                                    console.log('The Url is ' + url);
                                    return [4 /*yield*/, fetch(url + "/" + action, {
                                            method: 'GET'
                                        })];
                                case 1:
                                    resource = _a.sent();
                                    console.log('Called endpoint: ' + (url + "/" + action));
                                    return [4 /*yield*/, resource.json()];
                                case 2:
                                    isSent = _a.sent();
                                    console.log(isSent);
                                    return [2 /*return*/];
                            }
                        });
                    }); });
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
    var words;
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
            var topicSplit = words[3].split('/');
            var consumerDid = topicSplit[2];
            var dataSourceUid = topicSplit[3];
            var fromTopic_1 = "" + consumerDid + ("/" + dataSourceUid);
            addSubscriberToDatabase(consumerDid, dataSourceUid, words[0].replace(':', ''));
            console.log(consumerDid + " subscribed!");
            client.subscribe('/from/' + fromTopic_1, { qos: 2 });
            client.on('message', function (topic, message) {
                //console.log(topic + " " + message.toString())
                //console.log(proofOfOrigin.proof)
                if (topic.startsWith('/from/')) {
                    client.publish('/to/' + fromTopic_1, 'NRP');
                }
            });
            // Call start endpoint
        }
        if (topic.endsWith("$SYS/broker/log/M/unsubscribe") && words[2].startsWith("/to/" + words[1])) {
            var topicSplit = words[2].split('/');
            var dataSourceUid = topicSplit[3];
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
    var message_split;
    var topic_split;
    var consumerDid;
    var dataSourceUid;
    var timestamp;
    var topic_subscribed_to;
    var topic_unsubscribed_to;
    client.on('connect', function () {
        isConnected = true;
        console.log("Connected\n");
        client.subscribe('$SYS/broker/log/#');
    });
    client.on('message', function (topic, message) {
        return __awaiter(this, void 0, void 0, function () {
            var action, action, poP;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        console.log(">>>>> " + topic + " " + message.toString());
                        if (topic.startsWith("$SYS/broker/log/M/subscribe")) {
                            message_split = message.toString().split(' ');
                            topic_subscribed_to = message_split[3];
                            timestamp = message_split[0];
                            topic_split = message_split[3].split('/');
                            consumerDid = topic_split[2];
                            dataSourceUid = topic_split[3];
                        }
                        if (topic.startsWith("$SYS/broker/log/M/unsubscribe")) {
                            message_split = message.toString().split(' ');
                            topic_unsubscribed_to = message_split[2];
                            topic_split = message_split[2].split('/');
                            consumerDid = topic_split[2];
                            dataSourceUid = topic_split[3];
                        }
                        if (topic.startsWith("$SYS/broker/log/M/subscribe") && topic_subscribed_to.startsWith("/to/" + consumerDid)) {
                            client.subscribe('/from/' + ("" + consumerDid) + ("/" + dataSourceUid));
                            addSubscriberToDatabase(consumerDid, dataSourceUid, timestamp.replace(':', ''));
                            action = "subscribe";
                            start_or_end_stream(dataSourceUid, action);
                        }
                        if (topic.startsWith("$SYS/broker/log/M/unsubscribe") && topic_unsubscribed_to.startsWith("/to/" + consumerDid)) {
                            deleteSubscribtion(consumerDid, dataSourceUid);
                            client.unsubscribe('/from/' + ("" + consumerDid) + ("/" + dataSourceUid));
                            action = "unsubscribe";
                            start_or_end_stream(dataSourceUid, action);
                            console.log(consumerDid + " unsubscribed!");
                        }
                        if (!topic.startsWith('/from/')) return [3 /*break*/, 2];
                        return [4 /*yield*/, index_1.validateProofOfReception(message.toString())];
                    case 1:
                        poP = _a.sent();
                        client.publish('/to/' + ("" + consumerDid) + ("/" + dataSourceUid), JSON.stringify(poP));
                        _a.label = 2;
                    case 2: return [2 /*return*/];
                }
            });
        });
    });
}
exports["default"] = { subscribe: subscribe, mqttinit: mqttinit, mqttprocess: mqttprocess };
