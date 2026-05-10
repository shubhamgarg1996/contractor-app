const sql = require('mssql');

let poolPromise = null;

function getPool() {
  if (!poolPromise) {
    const conn = process.env.SQL_CONN;
    if (!conn) throw new Error('SQL_CONN environment variable is not set');
    poolPromise = sql.connect(conn).then(p => {
      p.on('error', err => {
        console.error('SQL pool error', err);
        poolPromise = null; // force reconnect on next call
      });
      return p;
    }).catch(err => {
      poolPromise = null;
      throw err;
    });
  }
  return poolPromise;
}

module.exports = { sql, getPool };
