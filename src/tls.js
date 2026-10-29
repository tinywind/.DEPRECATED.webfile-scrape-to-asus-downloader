const fs = require('fs');
const https = require('https');
const tls = require('tls');

function createHttpsAgent(caFile) {
  if (!caFile) return undefined;
  return new https.Agent({
    ca: [...tls.rootCertificates, fs.readFileSync(caFile)],
  });
}

module.exports = {createHttpsAgent};
