const axios = require('axios');
const {downloadMasterUrl} = require('./download-master-url');
const FormData = require('form-data');
const {createHttpsAgent} = require('./tls');

class DownloadMaster {
  constructor(config) {
    this.config = config;
    this.httpsAgent = createHttpsAgent(config.caFile);
    this.baseUrl = downloadMasterUrl(config);
    this.user = config.user;
    this.pwd = config.pwd;
    this.requestTimeout = config.requestTimeout || 30000;
    this.dmTimeout = config.dmTimeout || 10000;
    this.authCookie = null; // Store the authentication cookie
  }

  async login() {
    console.log('Logging in to ASUS Download Master...');
    this.authCookie = null;

    // Only include the required parameters: login_username and login_passwd
    const formData = new URLSearchParams();
    formData.append('login_username', Buffer.from(this.user).toString('base64'));
    formData.append('login_passwd', Buffer.from(this.pwd).toString('base64'));

    try {
      const response = await axios.post(`${this.baseUrl}/check.asp`, formData, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        timeout: this.dmTimeout,
        maxRedirects: 0,
        proxy: false,
        httpsAgent: this.httpsAgent,
        validateStatus: function (status) {
          return status >= 200 && status < 600; // Accept all status codes to handle them manually
        },
        // Make sure to capture cookies
        withCredentials: true
      });

      // Extract the authentication cookie from the response headers
      if (response.headers['set-cookie']) {
        const cookies = response.headers['set-cookie'];
        for (const cookie of cookies) {
          if (cookie.startsWith('AuthByPasswd=')) {
            this.authCookie = cookie.split(';')[0].substring('AuthByPasswd='.length);
            console.log('Authentication cookie obtained.');
            break;
          }
        }
      }

      if (!this.authCookie) {
        console.warn('No authentication cookie found in response');
      }

      if (response.status >= 200 && response.status < 300 && this.authCookie) {
        console.log('Login successful');
        return true;
      } else {
        console.error('Login failed with status:', response.status);
        return false;
      }
    } catch (error) {
      console.error('Login error:', error.message);
      return false;
    }
  }

  async queueUrl(url, fileName) {
    console.log(`Queueing file from ${url}...`);

    try {
      // For HTTP/HTTPS links, use dm_apply.cgi with usb_dm_url parameter
      const params = new URLSearchParams({
        action_mode: 'DM_ADD',
        download_type: '5',
        again: 'no',
        usb_dm_url: url,
        t: Math.random().toString()
      });

      // Based on the screenshot, this is the correct endpoint and parameters for HTTP/HTTPS links
      const response = await this._makeRequest(`${this.baseUrl}/downloadmaster/dm_apply.cgi?${params}`);

      if (response) {
        console.log(`Successfully queued ${url}`);
        return true;
      } else {
        console.error(`Failed to queue ${url}`);
        return false;
      }
    } catch (error) {
      console.error(`Error queueing URL ${url}:`, error.message);
      return false;
    }
  }

  async queueTorrent(url, torrentData) {
    console.log(`Queueing torrent from ${url}...`);

    try {
      // Extract filename from URL
      const fileName = url.split('/').pop() || 'download.torrent';

      // Create form data with the torrent file
      const formData = new FormData();
      
      // Set both name and filename parameters to the file name
      // Content-Type should be 'application/x-bittorrent'
      formData.append('file', Buffer.from(torrentData), {
        filename: fileName,
        contentType: 'application/x-bittorrent',
        name: fileName
      });

      // Upload the torrent file
      const response = await this._makeRequest(`${this.baseUrl}/downloadmaster/dm_uploadbt.cgi`, {
        method: 'post',
        data: formData,
        headers: {
          ...formData.getHeaders(),
          'Content-Type': 'multipart/form-data',
          'Content-Disposition': `form-data; name="${fileName}"; filename="${fileName}"`
        }
      });

      if (!response) {
        console.error(`Failed to upload torrent ${url}`);
        return false;
      }

      // Check if we need to confirm files
      if (response.data && response.data.includes('BT_ACK_SUCESS=')) {
        // Extract torrent name for confirmation
        const torrentName = this._extractTorrentName(response.data);
        if (torrentName) {
          return await this.confirmAllTorrentFiles(torrentName);
        }
      }

      console.log(`Successfully queued torrent ${url}`);
      return true;
    } catch (error) {
      console.error(`Error queueing torrent ${url}:`, error.message);
      return false;
    }
  }

  async confirmAllTorrentFiles(torrentName) {
    console.log(`Confirming all files in torrent: ${torrentName}`);

    try {
      const params = new URLSearchParams({
        filename: torrentName,
        download_type: 'All',
        D_type: '3',
        t: Math.random()
      });

      const response = await this._makeRequest(`${this.baseUrl}/downloadmaster/dm_uploadbt.cgi?${params}`);

      if (response) {
        console.log(`Successfully confirmed all files in torrent: ${torrentName}`);
        return true;
      } else {
        console.error(`Failed to confirm files in torrent: ${torrentName}`);
        return false;
      }
    } catch (error) {
      console.error(`Error confirming torrent files for ${torrentName}:`, error.message);
      return false;
    }
  }

  async _makeRequest(url, options = {}) {
    if (new URL(url).origin !== new URL(this.baseUrl).origin) return null;
    // Check if we have an authentication cookie
    if (!this.authCookie) {
      // If no auth cookie, try to login first
      const loginSuccess = await this.login();
      if (!loginSuccess) {
        console.error('Login failed. Cannot make request.');
        return null;
      }
    }

    // Try to make the request
    try {
      // Add the authentication cookie to the request headers
      const headers = options.headers || {};
      if (this.authCookie) {
        headers['Cookie'] = `AuthByPasswd=${this.authCookie}`;
      }

      const requestOptions = {
        timeout: this.requestTimeout,
        httpsAgent: this.httpsAgent,
        validateStatus: function (status) {
          return status >= 200 && status < 600; // Accept all status codes to handle them manually
        },
        ...options,
        maxRedirects: 0,
        proxy: false,
        headers
      };

      console.log(`Making request to: ${url}`);
      const response = await axios(url, requestOptions);
      console.log(`Response status: ${response.status}`);

      // Handle 598 status code (login failure) directly
      if (response.status === 598 || response.status === 401) {
        console.log(`Received status ${response.status} (login failure). Attempting to login and retry...`);
        this.authCookie = null; // Clear the auth cookie
        const loginSuccess = await this.login();
        if (loginSuccess) {
          console.log('Login successful. Retrying request...');
          try {
            // Update headers with new auth cookie
            if (this.authCookie) {
              requestOptions.headers['Cookie'] = `AuthByPasswd=${this.authCookie}`;
            }
            
            const retryResponse = await axios(url, requestOptions);
            console.log(`Retry response status: ${retryResponse.status}`);
            return retryResponse.status >= 200 && retryResponse.status < 300 ? retryResponse : null;
          } catch (retryError) {
            console.error('Request failed after login retry:', retryError.message);
            return null;
          }
        } else {
          console.error('Login failed. Cannot retry request.');
          return null;
        }
      }

      return response.status >= 200 && response.status < 300 ? response : null;
    } catch (error) {
      console.error('Request failed:', error.message);
      if (error.response) {
        console.error('Response status:', error.response.status);
      }
      return null;
    }
  }

  _extractTorrentName(responseText) {
    const ackPrefix = 'BT_ACK_SUCESS=';
    const listStart = responseText.indexOf(ackPrefix);
    const listEnd = responseText.indexOf('");</script>');

    if (listStart < 0 || listEnd < 0) {
      return null;
    }

    const list = responseText.substring(listStart + ackPrefix.length, listEnd);
    const entries = list.split(', #');

    if (entries.length < 2) {
      return null;
    }

    return entries[1];
  }
}

module.exports = DownloadMaster;
