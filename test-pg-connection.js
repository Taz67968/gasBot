const { Client } = require('pg');

const config = {
  host: 'ep-steep-mode-ak644w2e-pooler.c-3.us-west-2.aws.neon.tech',
  port: 5432,
  database: 'neondb',
  user: 'neondb_owner',
  password: 'npg_cxZOSvln4mE7',
  ssl: { rejectUnauthorized: false },
  connectTimeoutMillis: 10000,
};

console.log('Testing direct pg connection...');
const client = new Client(config);

client.connect()
  .then(() => {
    console.log('✅ Direct pg connection successful!');
    return client.query('SELECT NOW()');
  })
  .then(res => {
    console.log('Query result:', res.rows[0]);
    return client.end();
  })
  .then(() => {
    console.log('Connection closed');
  })
  .catch(err => {
    console.error('❌ Connection failed:', err.message);
    console.error('Error details:', err);
  });