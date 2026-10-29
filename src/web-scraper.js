const axios = require('axios');
const cheerio = require('cheerio');
const path = require('path');
const {createHttpsAgent} = require('./tls');
const fs = require('fs');

class WebScraper {
  constructor(config) {
    this.config = config;
    this.httpsAgent = createHttpsAgent(config.caFile);
  }

  /**
   * Scrape a webpage for file links matching the given pattern
   * @param {string} url - The URL of the webpage to scrape
   * @param {RegExp} pattern - The pattern to match file links
   * @param {Set<string>} skippedUrls - Set of URLs to skip (already processed)
   * @returns {Promise<Array<{url: string, isTorrent: boolean}>>} - Array of file links
   */
  async scrapeWebpage(url, pattern, skippedUrls = new Set()) {
    console.log(`Scraping webpage: ${url}`);
    const fileLinks = [];

    try {
      // Download the webpage
      const response = await axios.get(url, {
        timeout: 30000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        },
        httpsAgent: this.httpsAgent,
        validateStatus: function (status) {
          return status >= 200 && status < 600; // Accept all status codes to handle them manually
        }
      });

      // Check if the response was successful
      if (response.status < 200 || response.status >= 300) {
        console.error(`Error scraping webpage ${url}: HTTP status ${response.status}`);
        return [];
      }

      // Parse the HTML
      const $ = cheerio.load(response.data);
      
      // Find all links
      $('a').each((index, element) => {
        const href = $(element).attr('href');
        const text = $(element).text().trim();
        
        // Skip if no href or already processed
        if (!href || skippedUrls.has(href)) {
          return;
        }
        
        // Make sure the URL is absolute
        let absoluteUrl = href;
        if (href.startsWith('/')) {
          const baseUrl = new URL(url);
          absoluteUrl = `${baseUrl.protocol}//${baseUrl.host}${href}`;
        } else if (!href.startsWith('http://') && !href.startsWith('https://')) {
          absoluteUrl = new URL(href, url).href;
        }
        
        // Check if the link matches the pattern
        if (pattern.test(href) || pattern.test(text)) {
          const isTorrent = this._isTorrentLink(absoluteUrl);
          fileLinks.push({
            url: absoluteUrl,
            isTorrent
          });
        }
      });
      
      console.log(`Found ${fileLinks.length} matching file links on ${url}`);
      return fileLinks;
    } catch (error) {
      console.error(`Error scraping webpage ${url}:`, error.message);
      return [];
    }
  }

  /**
   * Download a torrent file
   * @param {string} url - The URL of the torrent file
   * @returns {Promise<Buffer|null>} - The torrent file data or null if download failed
   */
  async downloadTorrentFile(url) {
    console.log(`Downloading torrent file: ${url}`);
    
    try {
      const response = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 30000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        },
        httpsAgent: this.httpsAgent,
        validateStatus: function (status) {
          return status >= 200 && status < 600; // Accept all status codes to handle them manually
        }
      });

      // Check if the response was successful
      if (response.status < 200 || response.status >= 300) {
        console.error(`Error downloading torrent file ${url}: HTTP status ${response.status}`);
        return null;
      }
      
      return response.data;
    } catch (error) {
      console.error(`Error downloading torrent file ${url}:`, error.message);
      return null;
    }
  }

  /**
   * Check if a URL is a torrent link
   * @param {string} url - The URL to check
   * @returns {boolean} - True if the URL is a torrent link
   */
  _isTorrentLink(url) {
    // Check if the URL ends with .torrent
    if (url.toLowerCase().endsWith('.torrent')) {
      return true;
    }
    
    // Check if it's a magnet link
    if (url.toLowerCase().startsWith('magnet:')) {
      return true;
    }
    
    return false;
  }
}

module.exports = WebScraper;
