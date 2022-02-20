import 'dotenv/config';
import {configProxy} from '../common.js';
import {connectUdp} from './index.js';

const {SERVER = '127.0.0.1', PORT = '8000', TARGETS = '8100:127.0.0.1:8080'} = process.env;
let host = SERVER,
  port = parseInt(PORT);

let list = TARGETS.split(',');
list.map(setupProxy);

function setupProxy(proxySetting) {
  let client = connectUdp(configProxy(proxySetting, {host, port})).once('error', reconnect);

  function reconnect() {
    console.log('reconnect in 10s.', proxySetting);
    try {
      client.close();
    } catch {}

    client = null;
    setTimeout(() => {
      setupProxy(proxySetting);
    }, 10e3);
  }
}

process.on('uncaughtException', e => {
  console.error(e.message);
});
