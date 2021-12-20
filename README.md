# 1. Introduction

The data access api is the component which facilitates the data transfer between the consumer and the provider.
Data Access API enables data providers secured registration and consumers verification to access and/or exchange data in a peer-to-peer fashion, once the contracts and security mechanisms for identity management have been confirmed and executed. This improves scalability and avoids the need that data providers have to share their data assets with intermediaries (e.g. a marketplace provider).

### Data Management

Two methods for data transfer are supported by Data Access API which are supported by the following modules:

+ Batch Data Transfer Management
One time data transfer for one chunk of data in a session with the following methods:

    - Request data

    - Transfer data

+ Data Stream Management
Continuous transfer of data based on a subscription, e.g. publish/subscribe mechanism:

    - Subscribe to an offering

    - Trigger data transfer – on the producer side

    - Get data – on the consumer side

    - Unsubscribe

# 2. Run Data Access API using docker images

[Here](https://gitlab.com/i3-market/code/sp2/express-datatransfermanagement) is the data access api project repository.

* Clone the repository.
* Install docker engine
* Create docker network with this command:
```
docker create network -d bridge i3m
```
* CD into the directory and run the following command:
```
docker build -t data-access-api:latest
```
* To run the image use this command:
```
docker run -it --network=i3m -h data-access-api -p 3000:3000 data-access-api:latest
```
* In order to run the mqtt-broker, used for data stream, copy from data access api repository the mqtt_conf directory to the host machine. In this example mqtt_conf is copied in "/home/user". Then run this command to start the mqtt container:
```
docker run -it --network=i3m -h mqtt-broker -p 1884:1884 -p 1883:1883 -p 9001:9001 -v /home/iosif/mqtt_conf/mosquitto/mosquitto:/etc/mosquitto/ iegomez/mosquitto-go-auth
```
* In order to get an access token required for authentication and authorization the i3market wallet is needed which can be found [here](http://95.211.3.251:8081/#browse/browse:i3m-raw:i3m-wallet).

# 3. Data Access API endpoints

* To retrieve batch data:

    <mark>POST /{data}<mark>

* To validate the proof of reception:

    <mark>POST /validatePoR<mark>

* To check the ammount of data sent in a period of time:

    <mark>POST /createInvoice<mark>

* To get an access token as consumer:

    <mark>GET /oidc/login/consumer<mark>

* To get an access token as provider:

    <mark>GET /oidc/login/provider<mark>

* Authenticate mqtt user:

    <mark>POST /user<mark>

* Verify subscription topic:

    <mark>POST /acl<mark>

* Register/unregister data source:

    <mark>POST /regds<mark>

* Get data from data sources:

    <mark>POST /{data}<mark>