const {test} = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const crypto = require('node:crypto');
const DownloadMaster = require('../src/download-master');

test('ASUS credentials require HTTPS or an explicit private IP HTTP exception', async t => {
  const requests = [];
  const password = crypto.randomBytes(24).toString('hex');
  let redirect = false;
  const server = http.createServer((request, response) => {
    const chunks = [];
    request.on('data', chunk => chunks.push(chunk));
    request.on('end', () => {
      requests.push({url: request.url, cookie: request.headers.cookie});
      if (redirect) {
        response.writeHead(307, {Location: target});
      } else if (request.url === '/check.asp') {
        const form = new URLSearchParams(Buffer.concat(chunks).toString());
        assert.equal(Buffer.from(form.get('login_username'), 'base64').toString(), 'fixture-user');
        assert.equal(Buffer.from(form.get('login_passwd'), 'base64').toString(), password);
        response.setHeader('Set-Cookie', 'AuthByPasswd=fixture-session; HttpOnly');
      } else {
        assert.equal(request.headers.cookie, 'AuthByPasswd=fixture-session');
      }
      response.end('ok');
    });
  });
  let redirectedRequests = 0;
  const destination = http.createServer((request, response) => {
    redirectedRequests += 1;
    response.end('unexpected redirect');
  });
  await new Promise(resolve => destination.listen(0, '127.0.0.1', resolve));
  const target = `http://127.0.0.1:${destination.address().port}/redirect-target`;
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    for (const item of [server, destination]) {
      item.closeAllConnections();
      await new Promise(resolve => item.close(resolve));
    }
  });
  const settings = {url: `http://127.0.0.1:${server.address().port}`, user: 'fixture-user', pwd: password};

  await t.test('HTTP is rejected before credentials without a strict boolean opt-in', () => {
    for (const value of [undefined, false, 'true']) {
      assert.throws(() => new DownloadMaster({...settings, allowInsecureLanHttp: value}), /HTTPS/);
    }
    assert.equal(requests.length, 0);
  });

  await t.test('opt-in rejects public IPs, hostnames and embedded URL credentials', () => {
    for (const url of ['http://8.8.8.8', 'http://[2001:4860:4860::8888]', 'http://localhost',
      'http://router.asus.com', 'http://user:pass@192.168.1.1', 'ftp://192.168.1.1']) {
      assert.throws(() => new DownloadMaster({...settings, url, allowInsecureLanHttp: true}));
    }
    for (const url of ['http://10.0.0.1', 'http://172.16.0.1', 'http://192.168.1.1',
      'http://[::1]', 'http://[fd00::1]']) {
      assert.doesNotThrow(() => new DownloadMaster({...settings, url, allowInsecureLanHttp: true}));
    }
    assert.equal(requests.length, 0);
  });

  await t.test('explicit loopback HTTP performs real login and authenticated queue requests', async () => {
    const downloader = new DownloadMaster({...settings, allowInsecureLanHttp: true});
    assert.equal(await downloader.login(), true);
    assert.equal(await downloader.queueUrl('https://example.test/file.zip'), true);
    assert.equal(requests.length, 2);
  });

  await t.test('login and authenticated requests do not follow redirects or send credentials to another origin', async () => {
    redirect = true;
    const downloader = new DownloadMaster({...settings, allowInsecureLanHttp: true});
    assert.equal(await downloader.login(), false);
    downloader.authCookie = 'fixture-session';
    assert.equal(await downloader.queueUrl('https://example.test/file.zip'), false);
    assert.equal(await downloader._makeRequest(target), null);
    assert.equal(redirectedRequests, 0);
  });
});
