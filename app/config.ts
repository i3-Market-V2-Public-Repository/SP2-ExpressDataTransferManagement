import { randomFillSync } from 'crypto'
import { ClientMetadata } from 'openid-client'

const port = Number(process.env.PORT) ?? 3000
const server = {
  addr: '0.0.0.0',
  port,
  publicUri: process.env.PUBLIC_URI ?? `http://localhost:${port}` // It SHOULD BE https when using a public server
}

interface OidcConfig {
  providerUri: string
  client: ClientMetadata
}
const oidcConfig: OidcConfig = {
  providerUri: 'https://identity1.i3-market.eu/oidc',
  client: {
    client_id: '23DdUESxhQvj3a2fmIaqu',
    client_secret: '5UG6q_hfHWdiKJlu8l7Ps-7LDmpglxsZeuNG48Vm6xJSus1ZArEHKfPFOjUeYywQYjWbIwO1Lsmhaoe8pOQidg',
    redirect_uris: [`${server.publicUri}/oidc/cb`],
    application_type: 'web',
    grant_types: ['authorization_code'],
    response_types: ['code'],
    token_endpoint_auth_method: 'client_secret_jwt', // One of 'none' (only for PKCE), 'client_secret_basic', 'client_secret_jwt', 'client_secret_post', 'private_key_jwt'
    id_token_signed_response_alg: 'EdDSA' // One of 'HS256', 'PS256', 'RS256', 'ES256', 'EdDSA'
  }
}

const api = {
  allowedOrigin: server.publicUri // The domain allowed to connect to this sercer with JS, eg 'http://localhost:3000'
}

const jwt = {
  secret: randomFillSync(Buffer.alloc(32)).toString('base64'),
  iss: server.addr,
  aud: server.addr
}

export default { server, oidc: oidcConfig, api, jwt }
