import {EventEmitter} from 'events';
import getPort from 'get-port';
import tcp from 'net';
import pLimit from 'p-limit';
import {promisify} from 'util';

export function hasProp(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

export const once = promisify(EventEmitter.prototype.once);

export function sleep(time) {
  return new Promise(resolve => setTimeout(resolve, time));
}

export async function ping(host, port, connect) {
  let targetPort = await getPort();
  let server = tcp.createServer(onCon).listen(targetPort);
  await once.call(server, 'listening');
  let con = connect({port, host, serverPort: 9999, targetHost: '127.0.0.1', targetPort});
  await sleep(2e3);
  let client = tcp.connect(9999, host);

  async function onCon(income) {
    await once.call(income, 'data').catch(e => e);
    income.end('pong');
    income.destroy();
  }

  return new Promise(resolve => {
    let start = Date.now();
    client
      .once('ready', () => {
        client.write('ping');
      })
      .once('data', () => {
        callback(Date.now() - start);
      });

    let timeout = setTimeout(callback, 5e3, -1);

    function callback(delay = -1) {
      if (resolve) {
        resolve?.(delay);
        resolve = null;
      }
      if (timeout) {
        clearTimeout(timeout);
        timeout = null;
      }
      if (client) {
        client.destroy();
        client = null;
      }
      if (server) {
        server.close();
        server = null;
      }
      if (con) {
        closeCon(con, () => {
          con = null;
        });
      }
    }
  });
}

export function configProxy(proxySetting, extra = {}) {
  if (!proxySetting) throw new Error('[configProxy] proxySetting is required.');

  let [serverPort, targetHost, targetPort] = proxySetting.split(':');
  if (!serverPort && !targetPort)
    throw new Error("[configProxy] either `serverPort` or `targetPort` wasn't specified.");

  serverPort = serverPort || targetPort;
  targetPort = targetPort || serverPort;
  targetHost = targetHost || '127.0.0.1';
  serverPort = parseInt(serverPort, 10);
  targetPort = parseInt(targetPort, 10);
  return {serverPort, targetPort, targetHost, proxySetting, ...extra};
}

let exitQ = pLimit(1);
let exitResolve;
let handlers = [];
let exitPromise = new Promise(resolve => {
  exitResolve = callback => {
    resolve();
    exitQ(callback);
    exitResolve = () => {};
  };
});

exitQ(() => exitPromise);
exitQ(async () => {
  for (let fn of handlers) {
    try {
      await fn();
    } catch {}
  }
});

['exit', 'beforeExit', 'SIGINT', 'SIGUSR1', 'SIGUSR2', 'SIGTERM', 'SIGBREAK'].forEach(event => {
  process.on(event, sign => {
    exitResolve(() => {
      console.log(`exit by ${event} sign: ${sign}`);
      process.exit();
    });
  });
});

export function onExit(fn) {
  let wrapFn = () => fn?.();
  handlers.push(wrapFn);
  let pulled = false;
  return () => {
    if (pulled) return;
    pulled = true;
    handlers.splice(handlers.indexOf(fn), 1);
  };
}

const closeSymbol = Symbol('close');

export function forClose(con, fn) {
  con[closeSymbol] = fn;
}

export function closeCon(con, callback) {
  if (typeof callback !== 'function') {
    return new Promise(resolve => closeCon(con, resolve));
  }

  (con[closeSymbol] || callback)(callback);
}
