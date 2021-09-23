'use strict'
import express from 'express'
import session from 'express-session'
import passportPromise from './passport'
import http from 'http'
import morgan from 'morgan'
import routesPromise from './routes'
import config from './config'
import crypto from 'crypto'
import swaggerUI from "swagger-ui-express";
import YAML from "yamljs";

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
