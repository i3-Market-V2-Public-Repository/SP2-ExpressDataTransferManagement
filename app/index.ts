'use strict'
import * as express from 'express'
import * as session from 'express-session'
import passportPromise from './passport'
import * as http from 'http'
import * as morgan from 'morgan'
import routesPromise from './routes'
import config from './config'
import * as crypto from 'crypto'
import * as swaggerUI from "swagger-ui-express";
import * as YAML from "yamljs";
import client_subscription from './mqtt/client_subscribtion'
import * as mqtt from 'mqtt'

const main = async function (): Promise<void> {
  const app = express()
  const passport = await passportPromise()
  const swaggerDocument = YAML.load('./openapi/openapi.yaml');
  app.use(session({
    secret: crypto.randomBytes(32).toString('base64'),
    resave: false,
    saveUninitialized: false
  }))
  app.use(express.json())
  app.use(express.urlencoded({ extended: false }))
  app.use(morgan('dev'))
  app.use(passport.initialize())
  // app.use(passport.session())
  app.use('/api/docs', swaggerUI.serve, swaggerUI.setup(swaggerDocument));
  // Load routes
  app.use('/', await routesPromise())
  // Listen for consumers subscribtion
  //client_subscribtion.subscribe()
  client_subscription.mqttprocess(client_subscription.mqttinit())
  //const subscription: string = client_subscription.subscribe(client_subscription.client)
  //console.log(subscription)
  /**
   * Listen on .env SERVER_PORT or 3000/tcp, on all network interfaces.
   */

  const server = http.createServer(app)
  const { addr, port } = config.server
  server.listen(port, addr)

  /**
   * Event listener for HTTP server "listening" event.
   */

  server.on('listening', function (): void {
    console.log(`Listening on http://localhost:${config.server.port}`)
    console.log(`Listening on public ${config.server.publicUri}`)
  })
  
}

main().catch(err => { throw new Error(err) })
