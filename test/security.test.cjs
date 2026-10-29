const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');
const crypto = require('node:crypto');
const {execFileSync} = require('node:child_process');
const DownloadMaster = require('../src/download-master');
const WebScraper = require('../src/web-scraper');
const Scheduler = require('../src/scheduler');

const project = path.resolve(__dirname, '..');

test('TLS, authentication and scheduler preserve security boundaries', async t => {
  fs.mkdirSync(path.join(project, '.tmp'), {recursive: true});
  const root = fs.mkdtempSync(path.join(project, '.tmp', 'security-test-'));
  const certRoot = process.env.TEST_CERT_DIR || root;
  const certificate = path.join(certRoot, 'certificate.pem');
  const key = path.join(certRoot, 'key.pem');
  if (!process.env.TEST_CERT_DIR) {
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
      '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost',
      '-keyout', key, '-out', certificate], {stdio: 'ignore'});
  }
  const originalConsole = {log: console.log, warn: console.warn, error: console.error};
  const logs = [];
  for (const name of Object.keys(originalConsole)) console[name] = (...args) => logs.push(args.join(' '));
  const signals = new Map(['SIGINT', 'SIGTERM'].map(name => [name, new Set(process.listeners(name))]));
  let requests = 0;
  let logins = 0;
  let queued = 0;
  let uploads = 0;
  let retries = 0;
  const cookies = [];
  const credentials = new Map();
  const torrent = Buffer.from('d4:infod4:name7:fixtureee');
  const server = https.createServer({key: fs.readFileSync(key), cert: fs.readFileSync(certificate)}, (request, response) => {
    requests += 1;
    const url = new URL(request.url, 'https://localhost');
    const chunks = [];
    request.on('data', chunk => chunks.push(chunk));
    request.on('end', () => {
      if (url.pathname.endsWith('/check.asp')) {
        logins += 1;
        const form = new URLSearchParams(Buffer.concat(chunks).toString());
        const expected = credentials.get(url.pathname);
        if (!expected || Buffer.from(form.get('login_username') || '', 'base64').toString() !== expected.user
            || Buffer.from(form.get('login_passwd') || '', 'base64').toString() !== expected.pwd) {
          response.statusCode = 401;
          response.end('invalid credentials');
          return;
        }
        if (!url.pathname.startsWith('/missing-cookie')) {
          const cookie = crypto.randomBytes(32).toString('hex');
          cookies.push(cookie);
          response.setHeader('Set-Cookie', `AuthByPasswd=${cookie}; Path=/; HttpOnly; Secure`);
        }
        response.end('ok');
      } else if (url.pathname.includes('/downloadmaster/')
          && request.headers.cookie !== `AuthByPasswd=${cookies.at(-1)}`) {
        response.statusCode = 401;
        response.end('invalid session');
      } else if (url.pathname.endsWith('/dm_apply.cgi')) {
        queued += 1;
        if (url.pathname.startsWith('/retry') && retries++ === 0) response.statusCode = 401;
        if (url.pathname.startsWith('/denied')) response.statusCode = 403;
        response.end('ok');
      } else if (url.pathname.endsWith('/dm_uploadbt.cgi')) {
        const body = Buffer.concat(chunks);
        if (body.includes(torrent)) uploads += 1;
        response.end('ok');
      } else if (url.pathname === '/page') {
        response.setHeader('Content-Type', 'text/html');
        response.end('<a href="/file.zip">ZIP</a><a href="/file.torrent">Torrent</a>');
      } else if (url.pathname === '/file.torrent') {
        response.end(torrent);
      } else {
        response.end('file bytes');
      }
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    for (const [name, original] of Object.entries(originalConsole)) console[name] = original;
    for (const [name, before] of signals) {
      for (const listener of process.listeners(name)) if (!before.has(listener)) process.removeListener(name, listener);
    }
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(root, {recursive: true, force: true});
  });
  const port = server.address().port;
  const base = `https://localhost:${port}`;
  const config = suffix => {
    const settings = {url: base + (suffix || ''), user: 'fixture-user', pwd: crypto.randomBytes(24).toString('hex'), caFile: certificate};
    credentials.set((suffix || '') + '/check.asp', settings);
    return settings;
  };

  await t.test('untrusted TLS certificates are rejected before credentials are sent', async () => {
    const settings = config();
    delete settings.caFile;
    const before = requests;
    assert.equal(await new DownloadMaster(settings).login(), false);
    assert.deepEqual(await new WebScraper({}).scrapeWebpage(base + '/page', /zip/), []);
    assert.equal(requests, before);
  });

  await t.test('an explicit CA trusts the certificate while hostname validation stays enabled', async () => {
    assert.equal(await new DownloadMaster(config()).login(), true);
    const wrongHost = {...config(), url: `https://127.0.0.1:${port}`};
    assert.equal(await new DownloadMaster(wrongHost).login(), false);
  });

  await t.test('real HTTPS scraping, torrent upload and deduplication preserve the data flow', async () => {
    const scraper = new WebScraper({caFile: certificate});
    const downloader = new DownloadMaster(config());
    const beforeQueue = queued;
    const beforeUploads = uploads;
    const database = path.join(root, 'downloads.json');
    const scheduler = new Scheduler({interval: 0, runCount: 1, dbPath: database,
      webpageUrls: [{url: base + '/page', pattern: '\\.(zip|torrent)$'}]}, scraper, downloader);
    await scheduler._runScrapeAndDownload();
    await scheduler._runScrapeAndDownload();
    assert.equal(queued - beforeQueue, 1);
    assert.equal(uploads - beforeUploads, 1);
    assert.deepEqual(JSON.parse(fs.readFileSync(database)), [base + '/file.zip', base + '/file.torrent']);
  });

  await t.test('authentication retries once and non-success statuses do not become queued files', async () => {
    const downloader = new DownloadMaster(config('/retry'));
    const before = logins;
    assert.equal(await downloader.queueUrl(base + '/file.zip'), true);
    assert.equal(logins - before, 2);
    assert.equal(await new DownloadMaster(config('/denied')).queueUrl(base + '/file.zip'), false);
    assert.equal(await new DownloadMaster(config('/missing-cookie')).login(), false);
  });

  await t.test('authentication cookies never appear in application logs', () => {
    assert.ok(cookies.length > 0);
    for (const cookie of cookies) assert.equal(logs.some(line => line.includes(cookie.slice(0, 20))), false);
  });

  await t.test('a database creation race preserves existing records', () => {
    const database = path.join(root, 'race.json');
    const records = ['https://example.test/already-queued.zip'];
    fs.writeFileSync(database, JSON.stringify(records));
    const originalRead = fs.readFileSync;
    let firstRead = true;
    fs.readFileSync = (file, ...args) => {
      if (file === database && firstRead) {
        firstRead = false;
        throw Object.assign(new Error('database was missing before concurrent creation'), {code: 'ENOENT'});
      }
      return originalRead(file, ...args);
    };
    let scheduler;
    try {
      scheduler = new Scheduler({interval: 1, runCount: 1, dbPath: database}, null, null);
    } finally {
      fs.readFileSync = originalRead;
    }
    assert.deepEqual(JSON.parse(fs.readFileSync(database)), records);
    assert.deepEqual([...scheduler.skippedUrls], records);
  });
});
