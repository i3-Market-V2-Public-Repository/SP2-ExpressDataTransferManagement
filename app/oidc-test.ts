import { Issuer } from 'openid-client'

Issuer.discover('https://oidc.i3m.gold.upc.edu/oidc').then(function (issuer) {
  console.log('Discovered issuer %s %O', issuer.issuer, issuer.metadata)
}).catch(err => { throw new Error(err) })
