import dgram from 'dgram';
import {EventEmitter} from 'events';
import tcp from 'net';
import pLimit from 'p-limit';
import {v4 as uuid} from 'uuid';
import Queue from 'yocto-queue';
import {closeCon, forClose, hasProp, onExit} from '../common.js';

EventEmitter.setMaxListeners(0);

export function createUdpSender({
  sender,
  port,
  address,
  receiver,
  key,
  timeout = 2e3,
  before,
  after,
}) {
  let chunkSize = 0;
  let sendBuffer = Buffer.alloc(0);
  let limit = pLimit(1);

  let callback;
  let timer;

  function onReceiveMsg(msg) {
    msg = msg + '';
    msg
      .split('\n')
      .filter(Boolean)
      .forEach(line => {
        let [type, rKey] = line.split(':');
        if (type === 'receive' && rKey === key) callback?.();
      });
  }

  function nextChunk() {
    if (!sendBuffer.length) return null;
    let next = sendBuffer.slice(0, chunkSize);
    sendBuffer = sendBuffer.slice(chunkSize);
    return next;
  }

  function send(buf) {
    if (!chunkSize) chunkSize = sender.getSendBufferSize();
    sendBuffer = Buffer.concat([sendBuffer, buf]);
    if (!callback) {
      before?.();
      limit(sendNext).then(() => after?.());
    }
  }

  function sendNext() {
    return new Promise(resolve => {
      const next = nextChunk();

      const thisCallback = isFail => {
        if (isFail) {
          timer = setTimeout(thisCallback, timeout, true);
          sender.send(next, port, address);
          return;
        }

        callback = null;
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }

        if (sendBuffer.length) return sendNext().then(resolve);
        resolve();
      };

      callback = thisCallback;
      timer = setTimeout(thisCallback, timeout, true);
      sender.send(next, port, address);
    });
  }

  function end() {
    limit(() => {
      receiver.off('message', onReceiveMsg);
      sender.send(Buffer.alloc(0), port, address);
    });
  }

  receiver.on('message', onReceiveMsg);
  return {send, end};
}

export function serveUdp({port}) {
  const servMap = {};
  const serv = dgram
    .createSocket('udp4')
    .bind(port, '0.0.0.0')
    .once('listening', () => console.log('UDP server listening on port', port))
    .on('message', (msg, {port, address}) => {
      if (!msg?.length) return;
      msg = msg + '';
      const {pull, close} = msg.split('\n').reduce((ret, line) => {
        const [type, port] = line.split(':');
        ret[type] = port;
        return ret;
      }, {});

      if (pull) handlePull(pull, handleCon(port, address));
      if (close) servMap[close]?.close();
    });

  function handleCon(cliPort, cliAddress) {
    return function handle({con, key}) {
      let dataServ = dgram.createSocket('udp4');

      dataServ.send(`ready:${key}\n`, cliPort, cliAddress);
      dataServ.once('message', (ready, {port, address}) => {
        const {send, end} = createUdpSender({
          sender: dataServ,
          receiver: serv,
          port,
          address,
          key,
          timeout: 100,
        });

        con.on('data', send).once('close', end);

        dataServ.on('message', buf => {
          serv.send(`receive:${key}\n`, cliPort, cliAddress);
          if (!buf.length) return con.end();
          con.write(buf);
        });

        con.resume();
      });
    };
  }

  function handlePull(port, handler) {
    if (servMap[port]) {
      const {renew, que} = servMap[port];
      renew();
      while (que.size) handler(que.dequeue());
      return;
    }

    console.log('udp createServer', port);
    let que = new Queue();
    let server = tcp
      .createServer({allowHalfOpen: true, pauseOnConnect: true}, con => {
        let key = uuid();
        que.enqueue({con, key});
      })
      .listen(port);

    let timer;

    let context = {
      que,
      renew() {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          timer = null;
          context?.close();
        }, 5e3);
      },
      close() {
        server?.close(() => {
          console.log('udp closeServer', port);
          que = null;
          server = null;
          servMap[port] = null;
          context = null;
        });
      },
    };
    servMap[port] = context;
    servMap[port].renew();
  }
}

export function connectUdp({port, host, targetHost, serverPort, targetPort}) {
  let cliPort = port,
    cliAddress = host;
  const client = dgram.createSocket('udp4');

  let interval = setInterval(() => {
    client.send(`pull:${serverPort}\n`, port, host);
  }, 1e3);

  client
    .on('message', (msg, {port, address}) => {
      if (!msg?.length) return;

      msg = msg + '';
      msg
        .split('\n')
        .filter(Boolean)
        .forEach(line => {
          const [type, key] = line.split(':');
          if (type !== 'ready') return;

          handleOpen(key, port, address);
        });
    })
    .once('close', () => {
      clearInterval(interval);
    });

  forClose(client, callback => {
    const me = dgram.createSocket('udp4');
    me.send(`close:${serverPort}\n`, port, host, callback);
  });

  onExit(() => closeCon(client));

  return client;

  function handleOpen(key, port, address) {
    let proxy = tcp.connect({allowHalfOpen: true, port: targetPort, host: targetHost});
    let data = dgram.createSocket('udp4');

    const {send, end} = createUdpSender({
      sender: data,
      receiver: client,
      key,
      port,
      address,
    });

    proxy.on('data', send).once('close', end);

    data
      .on('message', buf => {
        client.send(`receive:${key}\n`, cliPort, cliAddress);
        if (!buf.length) return proxy.end();
        proxy.write(buf);
      })
      .send('ready', port, address);
  }
}
