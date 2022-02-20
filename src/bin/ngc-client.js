import 'dotenv/config';
import pLimit from 'p-limit';
import {configProxy, connectTcp, connectTls, connectUdp, ping, sleep} from '../tunnel/index.js';

let {TCP_PORT, TLS_PORT, UDP_PORT, HOST = '127.0.0.1', TARGETS} = process.env;
TCP_PORT = parseInt(TCP_PORT || '0', 10);
TLS_PORT = parseInt(TLS_PORT || '0', 10);
UDP_PORT = parseInt(UDP_PORT || '0', 10);

const main = async () => {
  let [method] = await findMethod();
  if (!method) {
    console.log('no available method');
    process.exit(1);
  }
  const {port, connect, name} = method;
  console.log(`connecting to ${HOST} using ${name}`);

  TARGETS.split(',')
    .filter(Boolean)
    .forEach(config => {
      try {
        connect(configProxy(config, {port, host: HOST}));
      } catch (e) {
        console.log(`error on create ${config} (${e.message})`);
      }
    });
};

async function findMethod() {
  let methods = [
    {name: 'tls', port: TLS_PORT, connect: connectTls},
    {name: 'udp', port: UDP_PORT, connect: connectUdp},
    {name: 'tcp', port: TCP_PORT, connect: connectTcp},
  ];

  const l = pLimit(1);
  methods.forEach(method => {
    const {port, connect} = method;
    l(async () => {
      await sleep(1e3);
      if (!port) return methods.splice(methods.indexOf(method), 1);
      method.delay = await ping(HOST, port, connect);
      console.log('%s delay %sms', method.name, method.delay);
      if (method.delay === -1) methods.splice(methods.indexOf(method), 1);
    });
  });

  await l(() => {});
  return methods;
}

main();
process.on('uncaughtException', e => {
  console.error(e.message);
});
