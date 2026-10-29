const fs = require('fs');
const path = require('path');

class Scheduler {
  constructor(config, scraper, downloader) {
    this.config = config;
    this.scraper = scraper;
    this.downloader = downloader;
    this.interval = config.interval * 1000; // Convert to milliseconds
    this.runCount = config.runCount;
    this.dbPath = config.dbPath;
    this.keepRunning = true;
    this.executions = 0;
    
    // Initialize skipped URLs set
    this.skippedUrls = new Set();
    this._loadSkippedUrls();
    
    // Setup signal handlers
    this._setupSignalHandlers();
  }

  /**
   * Start the scheduler
   */
  start() {
    console.log('Starting scheduler...');
    this._executeAndSchedule();
  }

  /**
   * Stop the scheduler
   */
  stop() {
    console.log('Stopping scheduler...');
    this.keepRunning = false;
  }

  /**
   * Execute the scraping and downloading process and schedule the next run
   * @private
   */
  async _executeAndSchedule() {
    if (this.runCount > 0 && this.executions >= this.runCount) {
      console.log('Scheduler stopped after reaching the execution limit.');
      return;
    }

    if (!this.keepRunning) {
      console.log('Scheduler stopped by signal.');
      return;
    }

    await this._runScrapeAndDownload();
    this.executions += 1;

    if (this.runCount === 0 || this.executions < this.runCount) {
      console.log(`Scheduling next run in ${this.interval / 1000} seconds...`);
      setTimeout(() => this._executeAndSchedule(), this.interval);
    }
  }

  /**
   * Run the scraping and downloading process for all configured URLs
   * @private
   */
  async _runScrapeAndDownload() {
    console.log('Running scrape and download process...');
    
    for (const { url, pattern } of this.config.webpageUrls) {
      try {
        const filePattern = new RegExp(pattern);
        const fileLinks = await this.scraper.scrapeWebpage(url, filePattern, this.skippedUrls);
        
        // Process each file link
        for (const fileLink of fileLinks) {
          if (this.skippedUrls.has(fileLink.url)) {
            continue;
          }
          
          let success = false;
          
          if (fileLink.isTorrent) {
            // Handle torrent file
            if (fileLink.url.toLowerCase().startsWith('magnet:')) {
              // Handle magnet link directly
              success = await this.downloader.queueUrl(fileLink.url);
            } else {
              // Download torrent file and queue it
              const torrentData = await this.scraper.downloadTorrentFile(fileLink.url);
              if (torrentData) {
                success = await this.downloader.queueTorrent(fileLink.url, torrentData);
              }
            }
          } else {
            // Handle regular file
            success = await this.downloader.queueUrl(fileLink.url);
          }
          
          if (success) {
            // Add to skipped URLs if successful
            this.skippedUrls.add(fileLink.url);
            this._saveSkippedUrls();
          }
        }
      } catch (error) {
        console.error(`Error processing URL ${url}:`, error.message);
      }
    }
  }

  /**
   * Load skipped URLs from the database file
   * @private
   */
  _loadSkippedUrls() {
    try {
      let data;
      try {
        data = fs.readFileSync(this.dbPath, 'utf8');
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
        fs.mkdirSync(path.dirname(this.dbPath), {recursive: true});
        try {
          fs.writeFileSync(this.dbPath, '[]', {encoding: 'utf8', flag: 'wx'});
          data = '[]';
        } catch (creationError) {
          if (creationError.code !== 'EEXIST') throw creationError;
          data = fs.readFileSync(this.dbPath, 'utf8');
        }
      }
      this.skippedUrls = new Set(JSON.parse(data));
      console.log(`Loaded ${this.skippedUrls.size} skipped URLs from database.`);
    } catch (error) {
      console.error('Error loading skipped URLs:', error.message);
    }
  }

  /**
   * Save skipped URLs to the database file
   * @private
   */
  _saveSkippedUrls() {
    try {
      const data = JSON.stringify(Array.from(this.skippedUrls), null, 2);
      fs.writeFileSync(this.dbPath, data, 'utf8');
    } catch (error) {
      console.error('Error saving skipped URLs:', error.message);
    }
  }

  /**
   * Setup signal handlers for graceful shutdown
   * @private
   */
  _setupSignalHandlers() {
    process.on('SIGINT', () => {
      console.log('Received SIGINT. Shutting down...');
      this.stop();
      // Force exit after a short delay to ensure cleanup
      setTimeout(() => {
        console.log('Forcing process exit...');
        process.exit(0);
      }, 1000);
    });

    process.on('SIGTERM', () => {
      console.log('Received SIGTERM. Shutting down...');
      this.stop();
      // Force exit after a short delay to ensure cleanup
      setTimeout(() => {
        console.log('Forcing process exit...');
        process.exit(0);
      }, 1000);
    });
  }
}

module.exports = Scheduler;
