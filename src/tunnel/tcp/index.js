import tcp from 'net';
import {generate} from 'selfsigned';
import tls from 'tls';
import {v4 as uuid} from 'uuid';
import {hasProp} from '../common.js';

export function connectTcp({host, port, serverPort, targetHost, targetPort, ssl}) {
  let net = ssl ? tls : tcp;
  if (net === tls) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  }

  return net
    .connect({host, port, rejectUnauthorized: false})
    .once('ready', function () {
      this.write('open:' + serverPort);
    })
    .on('data', openKey => {
      openKey = (openKey + '').trim();
      const proxy = tcp.connect(targetPort, targetHost);
      const open = net.connect({host, port});
      // console.log('handle proxy for {%s}', [serverPort, targetHost, targetPort].join(':'));

      open.write(openKey);
      open.pipe(proxy, {end: true}).pipe(open, {end: true});
    });
}

export function serveTcp({ssl, port, ...options} = {}) {
  let conMap = {};
  let servMap = {};
  let net = ssl ? tls : tcp;
  if (ssl) {
    const {private: key, cert} = generate(null, {keySize: 2048, algorithm: 'sha256', days: '30d'});
    options = {key, cert, ...options};
  }

  options.allowHalfOpen ??= true;

  function createServe(cli, port) {
    console.log('tcp createServer', port);

    servMap[port] = tcp
      .createServer({pauseOnConnect: true, allowHalfOpen: true}, con => {
        createCon(cli, con);
      })
      .listen(port);
  }

  function createCon(cli, con) {
    let key = uuid();
    // console.log('createCon', key);
    conMap[key] = {cli, con};
    cli.write(key + '\n');
  }

  function handleCon(key, target) {
    // console.log('handleCon', key);
    if (!hasProp(conMap, key)) return;

    const {cli, con} = conMap[key];
    if (cli.destroyed) return con.destroy();
    delete conMap[key];
    con.pipe(target, {end: true}).pipe(con, {end: true});
    con.resume();
  }

  function connectionHandler(client) {
    client.on('data', cmd => {
      cmd = cmd + '';
      if (cmd.startsWith('open:')) {
        const [, port] = cmd.split(':');
        return createServe(client, parseInt(port, 10));
      }

      if (cmd.startsWith('close:')) {
        const [, port] = cmd.split(':');
        if (port && servMap[port]) {
          client.destroy();
          console.log('tcp closeServer', port);
          servMap[port].close();
          servMap[port] = null;
        }

        return;
      }

      cmd
        .split(/\n/g)
        .filter(Boolean)
        .map(key => handleCon(key, client));
    });
  }

  net
    .createServer(options, connectionHandler)
    .once('listening', () => console.log('%s server listening on port', ssl ? 'TLS' : 'TCP', port))
    .listen(port);
}

export function connectTls(p) {
  return connectTcp({...p, ssl: true});
}
