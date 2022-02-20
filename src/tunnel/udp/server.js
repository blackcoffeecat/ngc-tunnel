import 'dotenv/config';
import {serveTcp, serveUdp} from './index.js';

const {PORT = '8000'} = process.env;
let port = parseInt(PORT);

serveUdp({port});

process.on('uncaughtException', e => {
  console.error(e.message);
});
