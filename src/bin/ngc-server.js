import 'dotenv/config';
import {serveTcp, serveUdp} from '../tunnel/index.js';

let {TCP_PORT, TLS_PORT, UDP_PORT} = process.env;
TCP_PORT = parseInt(TCP_PORT || '0', 10);
TLS_PORT = parseInt(TLS_PORT || '0', 10);
UDP_PORT = parseInt(UDP_PORT || '0', 10);

if (TCP_PORT) serveTcp({port: TCP_PORT});
if (TLS_PORT) serveTcp({port: TLS_PORT, ssl: true});
if (UDP_PORT) serveUdp({port: UDP_PORT});

process.on('uncaughtException', e => {
  console.error(e.message);
});
