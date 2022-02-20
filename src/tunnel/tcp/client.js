import 'dotenv/config';
import tcp from 'net';
import {configProxy} from '../common.js';
import {connectTcp} from './index.js';

const {SSL, SERVER = '127.0.0.1', PORT = '8000', TARGETS = '8100:127.0.0.1:8080'} = process.env;
let host = SERVER,
  port = parseInt(PORT),
  ssl = SSL === 'true';

let list = TARGETS.split(',');
list.map(setupProxy);

function setupProxy(proxySetting) {
  let client = connectTcp(configProxy(proxySetting, {host, port, ssl})).once('error', reconnect);

  function reconnect() {
    console.log('reconnect in 10s.', proxySetting);
    client.destroy();
    client = null;
    setTimeout(() => {
      setupProxy(proxySetting);
    }, 10e3);
  }
}

process.on('uncaughtException', e => {
  console.error(e.message);
});
