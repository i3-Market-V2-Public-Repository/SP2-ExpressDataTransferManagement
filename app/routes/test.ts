import * as nonRepudiationLibrary from '@i3m/non-repudiation-library'
import { JWK } from 'jose/webcrypto/types'
import *as common from '../commom'
import * as sqliteFunctions from '../sqliteFunctions'

const nrp = async () => {

    const privateJwks = await nonRepudiationLibrary.generateKeys('ES256')
    const publicJwk = JSON.stringify(privateJwks.publicJwk)
    // console.log(privateJwk)
    // console.log(publicJwk)
    /**
     * Using the Smart Contract Manager / Secure Data Access, a consumer and a provider would have agreed a Data Exchange Agreement
     */
    const dataExchangeAgreement: nonRepudiationLibrary.DataExchangeAgreement = {
      // Public key of the origin (data provider) for verifying the proofs she/he issues. It should be providerJwks.publicJwk
      orig: `${publicJwk}`,
      // Public key of the destination (data consumer)
      dest: `${publicJwk}`,
      // Encryption algorithm used to encrypt blocks. Either AES-128-GCM ('A128GCM') or AES-256-GCM ('A256GCM)
      encAlg: 'A256GCM',
      // Signing algorithm used to sign the proofs. It'e ECDSA secp256r1 with key lengths: either 'ES256', 'ES384', or 'ES512' 
      signingAlg: 'ES256',
      // Hash algorith used to compute digest/commitments. It's SHA2 with different output lengths: either 'SHA-256', 'SHA-384' or 'SHA-512'
      hashAlg: 'SHA-256',
      // The ledger smart contract address (hexadecimal) on the DLT
      ledgerContractAddress: '0x8d407a1722633bdd1dcf221474be7a44c05d7c2f',
      // The orig (data provider) address in the DLT (hexadecimal).
      ledgerSignerAddress: '0x17bd12C2134AfC1f6E9302a532eFE30C19B9E903',
      // Maximum acceptable delay between the issuance of the proof of origing (PoO) by the orig and the reception of the proof of reception (PoR) by the orig
      pooToPorDelay: 10000,
      // Maximum acceptable delay between the issuance of the proof of origing (PoP) by the orig and the reception of the proof of publication (PoR) by the dest
      pooToPopDelay: 20000,
      // If the dest (data consumer) does not receive the PoP, it could still get the decryption secret from the DLT. This defines the maximum acceptable delay between the issuance of the proof of origing (PoP) by the orig and the publication (block time) of the secret on the blockchain.
      pooToSecretDelay: 150000
    }
  
    // Let us define the RPC endopint to the ledger (just in case we don't want to use the default one)
    const dltConfig: Partial<nonRepudiationLibrary.DltConfig> = {
      rpcProviderUrl: 'http://95.211.3.244:8545'
    }
    
    // We are going to directly provide the private key associated to the dataExchange.ledgerSignerAddress. You could also have pass a DltSigner instance to dltConfig.signer in order to use an externam Wallet, such as the i3-MARKET one
    const providerDltSigningKeyHex = '0x4b7903c8fe18e4ba5329939c7d1c4318307794a544f3eb5fb3b6536210c98676'
  
    /**
     * Intialize the non-repudiation protocol as the origin. Internally, a one-time secret is created and the block is encrypted. They could be found in npProvider.block.secret and npProvide.block.jwe respectively.
     * You need:
     *  - the data agreement. It will be parsed for correctness.
     *  - the private key of the provider. It is used to sign the proofs and to sign transactions to the ledger (if not stated otherwise)
     *  - the block of data to send as a Uint8Array
     *  - [optional] a Partial<DltConfig> object with your own config for the DLT (see DltConfig interface)
     *  - [optional] a private key in hex for the DLT, just in case no DltSigner is provided in dltConfig
     */
    // const data = 'data that is'
    // const total = Number(data) + 1
    // console.log(String(total))
    // console.log(total)
    // let block = Buffer.from(data)
    // console.log(block.length)
    // console.log(block)
    // console.log(String(block))
    // const timestamp = common.getTimestamp()
    // sqliteFunctions.addSubscriberToDatabase('consumer', 'datasource', timestamp, '0', '256')
    // const report = await sqliteFunctions.streamingAccountReport('0')
    // console.log(report)

    // let db = sqliteFunctions.connectToDatabase('./db/consumer_subscribers.db3')
    // sqliteFunctions.saveAmmountOfDataSent('256', 0, db)
    // let arr:any = []
    // let c = '<Buffer 7b 0a 20 20 20 20 22 6d 73 67 22 3a 22 73 6f 6d 65 20 74 65 78 74 22 0a 7d>'
    // arr = c.replace('<Buffer ', '').replace(">", '').split(' ')
    // console.log(arr)
    // const buf = Buffer.from(arr)
    // console.log(buf)

    let arr:any = []
    arr.push({msg:"some",
              msg2: {
                msg3: "text"
              }
    })
    console.log(arr)
    // const d = '{  \"msg\":\"some text\" }'
    // let buf = Buffer.from(d)
    // console.log(buf)
    // console.log(String(Buffer.from(buf)))
    //===============================================================
    // const npProvider = new nonRepudiationLibrary.NonRepudiationProtocol.NonRepudiationOrig(dataExchangeAgreement, privateJwks.privateJwk, block, providerDltSigningKeyHex)
    // const npConsumer = new nonRepudiationLibrary.NonRepudiationProtocol.NonRepudiationDest(dataExchangeAgreement, privateJwks.privateJwk)
    // // Create the proof of origin (PoO)
    // const poo = await npProvider.generatePoO()
    // console.log("the poo is " + JSON.stringify(poo))

    // console.log('The cipherblock is ' + npProvider.block.jwe)

    // await npConsumer.verifyPoO(poo.jws, npProvider.block.jwe)

    // const por = await npConsumer.generatePoR()
    // await npProvider.verifyPoR(por.jws)

    // const pop = await npProvider.generatePoP()
    // console.log('==================')
    // console.log(pop)
    // await NRPcompletenessCheck(npProvider)

    //========================================================
    // Send the cipherblock in npProvider.block.jwe along with the poo to the consumer
    //...
  
    // Receive proof of reception (PoR) and stored in variable por
    //...
  
    // Verify PoR. If verification passes the por is added to npProvider.block.por; otherwise it throws an error.
    //await npProvider.verifyPoR(por)
  
    // Create proof of publication. It connects to the ledger and publishes the secret that can be used to decrypt the cipherblock
    //const pop = await npProvider.generatePoP()
  
    // Send pop to the consumer. The PoP includes the secret to decrypt the cipherblock; although the consumer could also get the secret from the smart contract
    //...
  
    // It is desired to send a signed resolution about the completeness of the protocol by a trusted third party (the CRS), so generate a verification Request as:
    //verificationRequest = await npProvider.generateVerificationRequest()
  
    // Send the verificationRequest to the CRS
    //...
    
    // and receive a signed resolution. The resolution can be decoded/verified as:
    // const { payload, signer } = await nonRepudiationLibrary.ConflictResolution.verifyResolution<VerificationResolutionPayload>(resolution)
    // if (payload.resolution === 'completed') {
      // is a valid proof of completeness signed by signer (the public JWK)
    }

  nrp()
  