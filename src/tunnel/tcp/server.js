import 'dotenv/config';
import {serveTcp} from './index.js';

const {SSL, PORT = '8000'} = process.env;
let port = parseInt(PORT),
  ssl = SSL === 'true';

serveTcp({ssl, port});

process.on('uncaughtException', e => {
  console.error(e.message);
});
