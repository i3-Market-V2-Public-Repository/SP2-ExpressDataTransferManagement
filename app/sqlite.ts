import * as sqlite3  from 'sqlite3';

export function connectToDatabase (pathToDb: string){
    let db = new sqlite3.Database(pathToDb, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE
    , (err) => {
        if (err) {
            console.error(err.message);
        } else {
            console.log('Connected to database '+pathToDb);
        }
    });
    return db
}

export function addDataSpaceUser (user, password) {

    var db = connectToDatabase('./db/data_space_users.db3')

    db.prepare('CREATE TABLE IF NOT EXISTS data_space_users(user TEXT, password TEXT);', function(err) {
        if (err) {
            console.log(err.message)
        }
    console.log('Check if table data_space_users exists before adding new users')}).run().finalize();

    console.log("User => "+user+" Password => "+password)
    
    let select = 'SELECT * FROM data_space_users WHERE user=?'
    let insert = 'INSERT into data_space_users(user, password) VALUES (?, ?)'
    db.serialize(function(){
        db.all(select, [user], (err, rows) => {
                if (err) {
                 console.log(err)
                }else if(rows.length == 0){
                    db.run(insert, [user, password], (err) => {
                        if (err) {
                         console.log(err)
                        }
                        db.close();
                    });
                }
            });
        })
}

exports.findByUsername = function(username, cb) {
    process.nextTick(function() {
        var db = connectToDatabase('./db/data_space_users.db3')
        let sql = 'SELECT * FROM data_space_users where user = ?'

        db.serialize(function(){
            db.all(sql, [username], (err, rows) => {
                if (err) {
                 console.log(err)
                }else if(rows.length > 0){
                    var record = rows[0]
                    return cb(null, record)
                }else {
                    return cb(null, null);
                }
            });
        })
        db.close()
    });
  }
