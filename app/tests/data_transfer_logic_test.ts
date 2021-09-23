import { getFilesizeInBytes, responseData } from '../routes/index'
import { expect } from 'chai';
import fs from 'fs'

let chaiHttp = require('chai-http');
let chai = require('chai');
chai.use(chaiHttp);
const should = chai.should();

const resource_map_path = `./data/exampledata.7z.json`
const resource_path = `./data/exampledata.7z`
var map = fs.readFileSync(resource_map_path, 'utf8');
let obj: any = JSON.parse(map);
const ID: string = "null"

//test functions
describe('Functions tests', () => {
    it('returns the file size in bytes', () => {
        expect(getFilesizeInBytes('./data/exampledata.7z')).to.be.equal(664);
    })
    //return response data
    it('returns respose data format', async() => {
        return responseData(ID, obj, resource_path).then(result => {
            expect(result).to.be.an("object").to.have.property("block_id").to.equal("null")
        })
    })
    //test get block endpoint
    it('it should GET data object', (done) => {
        chai.request('http://localhost:3000')
            .post('/exampledata.7z')
            .set('content-type', 'application/x-www-form-urlencoded')
            .send({block_id: 'null', block_ack: 'null'})
            //get token from /oidc/login/consumer
            .set('Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiIwLjAuMC4wIiwiYXVkIjoiMC4wLjAuMCIsImV4cCI6MTYyMjgxODE0MCwic3ViIjoiZGlkOmV0aHI6MHhlOTliNWJmNmQ4NzdkYmQ2NDVmMjAyZjExYWVhOGVmZmVlNmM0Yjg4Iiwic2NvcGUiOiJvcGVuaWQgdmMgdmNlOmNvbnN1bWVyIiwiaWF0IjoxNjIyNzMxNzQwfQ.vnEF5onHtcQO6fFfOFO3w5Av5g0JgGHTj1nqP8FWbxI')
            .end((err, res) => {
                  should.exist(res.body);
                  res.should.have.status(200);
                  res.body.should.be.a('object');
                  expect(res.body).to.have.property("block_id").to.equal("null")
              done();
            })
    })
})
