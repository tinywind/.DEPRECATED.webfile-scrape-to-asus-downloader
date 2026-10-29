const {BlockList, isIP} = require('node:net');

const privateAddresses = new BlockList();
privateAddresses.addSubnet('10.0.0.0', 8, 'ipv4');
privateAddresses.addSubnet('172.16.0.0', 12, 'ipv4');
privateAddresses.addSubnet('192.168.0.0', 16, 'ipv4');
privateAddresses.addSubnet('127.0.0.0', 8, 'ipv4');
privateAddresses.addAddress('::1', 'ipv6');
privateAddresses.addSubnet('fc00::', 7, 'ipv6');

function downloadMasterUrl(config) {
  const url = new URL(config.url);
  if (url.username || url.password || url.search || url.hash) {
    throw new Error('ASUS URL must not contain credentials, a query or a fragment');
  }
  if (url.protocol === 'https:') return url.href.replace(/\/+$/, '');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const family = isIP(host);
  if (url.protocol !== 'http:' || config.allowInsecureLanHttp !== true || !family
      || !privateAddresses.check(host, family === 6 ? 'ipv6' : 'ipv4')) {
    throw new Error('ASUS URL requires HTTPS; LAN HTTP needs allowInsecureLanHttp: true and a private or loopback IP');
  }
  return url.href.replace(/\/+$/, '');
}

module.exports = {downloadMasterUrl};
