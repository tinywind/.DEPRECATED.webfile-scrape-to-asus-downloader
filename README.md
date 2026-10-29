# WebFile Scrape to ASUS Downloader

이 프로젝트는 웹 페이지에서 파일 링크를 스크랩하여 ASUS Download Master로 다운로드를 자동화하는 도구입니다.

## 기능

- 설정된 웹 페이지에서 특정 패턴의 파일 링크를 주기적으로 스크랩
- 일반 파일 링크는 ASUS Download Master로 직접 다운로드 요청
- 토렌트 파일은 자동으로 감지하여 토렌트 다운로드 방식으로 처리
- 이미 처리된 링크는 중복 다운로드 방지

## 설치 방법

1. 프로젝트 클론 또는 다운로드
2. 의존성 패키지 설치

```bash
npm install
```

## 설정 방법

`config.json` 파일을 수정하여 설정합니다:

```json
{
  "webpageUrls": [
    {
      "url": "스크랩할_웹페이지_URL",
      "pattern": "찾을_파일_패턴"
    }
  ],
  "asusDownloadMaster": {
    "url": "http://router.asus.com:8081",
    "user": "admin",
    "pwd": "admin",
    "requestTimeout": 30000,
    "dmTimeout": 10000
  },
  "interval": 3600,
  "runCount": 0,
  "dbPath": "./scrap.db"
}
```

### 설정 항목 설명

- `webpageUrls`: 스크랩할 웹 페이지 URL과 파일 패턴 목록
  - `url`: 스크랩할 웹 페이지 URL
  - `pattern`: 찾을 파일 링크 패턴 (정규식)
- `asusDownloadMaster`: ASUS Download Master 설정
  - `url`: ASUS Download Master URL (기본값: http://router.asus.com:8081)
  - `user`: 라우터 관리자 사용자 이름
  - `pwd`: 라우터 관리자 비밀번호
  - `requestTimeout`: 요청 타임아웃 (밀리초)
  - `dmTimeout`: Download Master 타임아웃 (밀리초)
- `interval`: 스크랩 주기 (초)
- `runCount`: 실행 횟수 (0은 무제한)
- `dbPath`: 처리된 URL 데이터베이스 파일 경로

## 실행 방법

### 직접 실행

```bash
npm start
```

또는 특정 설정 파일을 지정하여 실행:

```bash
node src/index.js /path/to/config.json
```

### Docker를 사용한 실행

이 프로젝트는 Docker를 사용하여 실행할 수도 있습니다. Docker를 사용하면 의존성 설치나 환경 설정 없이 쉽게 실행할 수 있습니다.

#### Docker Hub에서 이미지 사용

이 프로젝트의 Docker 이미지는 Docker Hub에서 제공됩니다:

[https://hub.docker.com/r/tinywind0/webfile-scrape-to-asus-downloader](https://hub.docker.com/r/tinywind0/webfile-scrape-to-asus-downloader)

Docker Hub에서 이미지를 사용하려면 다음과 같이 실행합니다:

1. 프로젝트 디렉토리에 `config.json` 파일을 생성하고 설정합니다.
2. 다음 명령어로 Docker 이미지를 다운로드하고 실행합니다:

```bash
docker run -d \
  --name webfile-scrape-to-asus-downloader \
  -v $(pwd)/config.json:/config.json \
  -v $(pwd)/scrap.db:/usr/src/app/scrap.db \
  --restart unless-stopped \
  tinywind0/webfile-scrape-to-asus-downloader
```

Windows PowerShell에서는 다음과 같이 실행합니다:

```powershell
docker run -d `
  --name webfile-scrape-to-asus-downloader `
  -v ${PWD}/config.json:/config.json `
  -v ${PWD}/scrap.db:/usr/src/app/scrap.db `
  --restart unless-stopped `
  tinywind0/webfile-scrape-to-asus-downloader
```

#### 직접 빌드하여 실행

소스 코드에서 직접 Docker 이미지를 빌드하여 실행할 수도 있습니다:

##### 사전 요구 사항

- Docker
- Docker Compose

##### Docker 실행 방법

1. 프로젝트 디렉토리에 `config.json` 파일을 생성하고 설정합니다.
2. 다음 명령어로 Docker 컨테이너를 빌드하고 실행합니다:

```bash
docker-compose up -d
```

3. 로그를 확인하려면 다음 명령어를 사용합니다:

```bash
docker-compose logs -f
```

4. 컨테이너를 중지하려면 다음 명령어를 사용합니다:

```bash
docker-compose down
```

#### Docker 볼륨

Docker 설정에서는 다음 볼륨을 사용합니다:

- `./config.json:/config.json`: 설정 파일
- `./scrap.db:/usr/src/app/scrap.db`: 처리된 URL 데이터베이스 파일

필요에 따라 `docker-compose.yml` 파일이나 `docker run` 명령어의 볼륨 설정을 변경할 수 있습니다.

## 작동 방식

1. 설정된 웹 페이지에서 파일 링크를 스크랩
2. 링크가 토렌트 파일인지 확인
   - 토렌트 파일이면: 토렌트 파일을 다운로드하여 ASUS Download Master에 토렌트 다운로드 요청
   - 일반 파일이면: ASUS Download Master에 직접 다운로드 요청
3. 성공적으로 처리된 링크는 데이터베이스에 저장하여 중복 다운로드 방지
4. 설정된 주기마다 반복 실행

## 요구 사항

- Node.js 14.0 이상
- ASUS 라우터와 Download Master 설치 및 실행

## 문제 해결

### SSL/TLS 인증서 오류

ASUS 라우터에 연결할 때 SSL/TLS 인증서 오류가 발생할 수 있습니다. 이 프로젝트는 자체 서명된 인증서나 유효하지 않은 인증서를 무시하도록 설정되어 있습니다.

### 세션 관리 및 인증

ASUS Download Master와의 통신에서 세션 유지가 중요합니다. 이 프로젝트는 로그인 시 "AuthByPasswd" 쿠키를 추출하여 모든 후속 요청에 포함시킴으로써 세션을 유지합니다. 로그인 과정에서는 사용자 이름과 비밀번호만 base64로 인코딩하여 전송합니다.

```javascript
// 로그인 요청 예시
const formData = new URLSearchParams();
formData.append('login_username', Buffer.from(this.user).toString('base64'));
formData.append('login_passwd', Buffer.from(this.pwd).toString('base64'));

// 인증 쿠키 추출 및 저장
if (response.headers['set-cookie']) {
  const cookies = response.headers['set-cookie'];
  for (const cookie of cookies) {
    if (cookie.startsWith('AuthByPasswd=')) {
      this.authCookie = cookie.split(';')[0].substring('AuthByPasswd='.length);
      break;
    }
  }
}

// 후속 요청에 쿠키 포함
headers['Cookie'] = `AuthByPasswd=${this.authCookie}`;
```

이를 통해 로그인 실패 문제를 최소화하고 안정적인 다운로드 작업을 수행할 수 있습니다.

### 파일 다운로드 처리 방식

ASUS Download Master는 파일 유형에 따라 다른 방식으로 다운로드 요청을 처리합니다:

#### 일반 HTTP/HTTPS 링크 다운로드

일반 웹 링크는 `dm_apply.cgi` 엔드포인트를 사용하여 다운로드합니다:

```javascript
// HTTP/HTTPS 링크 다운로드 요청
const params = new URLSearchParams({
  action_mode: 'DM_ADD',
  download_type: '5',
  again: 'no',
  usb_dm_url: url,  // 다운로드할 URL
  t: Math.random().toString()
});

// 요청 전송
const response = await this._makeRequest(`${this.baseUrl}/downloadmaster/dm_apply.cgi?${params}`);
```

#### 토렌트 파일 업로드

토렌트 파일은 `dm_uploadbt.cgi` 엔드포인트를 사용하여 업로드합니다. 이때 Content-Type을 'application/x-bittorrent'로 설정하고, name과 filename 파라미터에 파일명을 지정해야 합니다:

```javascript
// 토렌트 파일 업로드 요청
const formData = new FormData();
formData.append('file', Buffer.from(torrentData), {
  filename: fileName,
  contentType: 'application/x-bittorrent',
  name: fileName
});

// 요청 전송
const response = await this._makeRequest(`${this.baseUrl}/downloadmaster/dm_uploadbt.cgi`, {
  method: 'post',
  data: formData,
  headers: {
    ...formData.getHeaders(),
    'Content-Type': 'multipart/form-data',
    'Content-Disposition': `form-data; name="${fileName}"; filename="${fileName}"`
  }
});
```

토렌트 파일 업로드 후에는 토렌트 내의 파일들을 확인하는 과정이 필요합니다. 이 프로젝트는 이 과정을 자동으로 처리합니다.

## 참조 프로젝트

이 프로젝트는 다음 두 프로젝트의 코드와 아이디어를 참조하여 개발되었습니다:

- [webfile-scraper](https://github.com/tinywind/webfile-scraper) - 웹 페이지에서 파일 링크를 스크랩하는 기능
- [asus-downloader-chrome](https://github.com/acc15/asus-downloader-chrome) - ASUS Download Master와 통신하는 기능

두 프로젝트의 기능을 통합하여 웹 페이지에서 파일 링크를 자동으로 스크랩하고 ASUS Download Master로 다운로드하는 완전한 솔루션을 제공합니다.


## Security checks

Use a supported Node.js LTS release; the container now uses Node.js 26. The locked dependency installation uses `npm ci`.

HTTPS requests use normal certificate and hostname verification. For a private or self-signed CA, set `asusDownloadMaster.caFile` to a local PEM CA bundle. Set top-level `caFile` separately when a scraped HTTPS site uses a private CA. These certificates are added to the built-in trust roots; hostname verification remains enabled.

Login requires both a successful response and an authentication cookie. Authentication cookies and response header dumps are not logged. A failed queue response is not recorded as a successful download. Database creation is exclusive and preserves records created concurrently by another process.

Run `npm test` for local HTTPS certificate, login, retry, torrent upload, deduplication, cookie logging, and database-race regressions. Tests use generated certificates and isolated files under `.tmp/`; OpenSSL is required to generate the test certificate. A prepared test-only certificate directory can be supplied through `TEST_CERT_DIR`. Docker validation uses an in-container loopback server with external networking disabled. No actual ASUS router or download service is contacted.
