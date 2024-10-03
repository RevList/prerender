var prerender = require('./lib');
const redisCache = require('prerender-redis-cache');
const redis = require('redis');
const cron = require('node-cron');
const { exec } = require('child_process');

// Configuration options for the Prerender server
const options = {
    pageDoneCheckInterval: 500,
    pageLoadTimeout: 60000, // Increased to 60 seconds
    waitAfterLastRequest: 500,
    jsTimeout: 60000, // Increased to 60 seconds
    iterations: 50, // Increased to handle more requests before restarting
    restart: true,
    chromeFlags: [
        '--no-sandbox',
        '--headless',
        '--disable-gpu',
        '--remote-debugging-port=9222',
        '--disable-dev-shm-usage',
        '--hide-scrollbars',
        '--disable-software-rasterizer',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process',
        '--disable-background-timer-throttling',
        '--disable-renderer-backgrounding',
        '--disable-backgrounding-occluded-windows',
        '--disable-extensions',
        '--disable-translate',
        '--disable-sync',
    ],
};

// Start the Prerender server with configured options
const server = prerender(options);

// Configure Redis client
const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
const redisClient = redis.createClient({
    url: redisUrl,
    retry_strategy: function (options) {
        if (options.error) {
            console.error('Redis Error:', options.error);
        }
        if (options.total_retry_time > 1000 * 60 * 10) { // Retry for up to 10 minutes
            return new Error('Retry time exhausted');
        }
        if (options.attempt > 5) {
            console.warn('Max Redis connection attempts reached.');
            return undefined;
        }
        return Math.min(options.attempt * 200, 3000);
    },
});

redisClient.on('error', (err) => {
    console.error(`Redis Error: ${err}`);
});

// Use Redis cache middleware
server.use(redisCache);

// Middleware to log requests and check Chrome status
server.use({
    requestReceived: (req, res, next) => {
        console.log(`Request received for: ${req.url}`);
        checkChromeAlive()
            .then(isAlive => {
                if (!isAlive) {
                    console.warn('Chrome is down, restarting...');
                    restartChrome();
                }
                next();
            })
            .catch(err => {
                console.error('Error checking Chrome status:', err);
                restartChrome();
                next();
            });
    }
});

// Middleware to ignore specific URLs
server.use({
    requestReceived: (req, res, next) => {
        const url = req.url.toLowerCase();
        if (url.startsWith('/app/')) {
            console.log(`Ignoring URL: ${req.url}`);
            res.sendStatus(404); // Or any other appropriate status code
        } else {
            next();
        }
    }
});

server.use(prerender.sendPrerenderHeader());
server.use(prerender.browserForceRestart());
server.use(prerender.removeScriptTags());
server.use(prerender.httpHeaders());
server.use(prerender.addMetaTags());

// Improved pageDoneCheck to ensure complete page rendering
server.use({
    pageDoneCheck: (req, res) => {
      const startTime = Date.now();
      const MAX_WAIT_TIME = 60000; // Maximum wait time of 60 seconds
      const prerenderReady = req.prerender.page.evaluate(() => window.prerenderReady)
        .catch(err => {
          console.error(`Error evaluating window.prerenderReady for ${req.url}:`, err);
          return false;
        });
  
      // Check if window.prerenderReady is set or if maximum wait time has passed
      return prerenderReady || (Date.now() - startTime > MAX_WAIT_TIME);
    }
  });

// Middleware to handle caching and logging before sending to Redis
server.use({
    beforeSend: async (req, res, next) => {
        try {
            const prerenderReady = await req.prerender.page.evaluate(() => window.prerenderReady);
            const statusCode = req.prerender.statusCode;
            if (!prerenderReady) {
                console.warn(`Skipping Redis cache for ${req.url}: prerenderReady flag is not set.`);
                req.prerender.cache = false; // Skip caching
            }
            console.log(`Sending response for ${req.url} with status ${statusCode}. prerenderReady: ${prerenderReady}`);
        } catch (err) {
            console.error(`Error during prerenderReady evaluation for ${req.url}: ${err}`);
            req.prerender.cache = false; // Skip caching on error
        }
        next();
    }
});

// Error handling middleware for page errors
server.use({
    pageError: (req, res, next) => {
        console.error(`Page error occurred for URL: ${req.url}. Error: ${req.prerender.error}`);
        res.sendStatus(500); // Send a 500 status code on failure
    }
});

// Start the Prerender server
server.start();

// Function to restart Chrome instance
const restartChrome = () => {
    server.killChrome();
    console.log('Chrome instance killed, spawning new instance...');
    server.spawnChrome();
};

// Custom function to check if Chrome is running
const checkChromeAlive = () => {
    return new Promise((resolve) => {
        exec('pgrep -fl chrome', (err, stdout, stderr) => {
            if (err) {
                console.error('Error checking Chrome status:', stderr);
                resolve(false);
            }
            resolve(stdout.includes('chrome'));
        });
    });
};

// Cron job to restart Chrome instance every 5 minutes if not alive
cron.schedule('*/5 * * * *', () => {
    checkChromeAlive()
        .then(isAlive => {
            if (!isAlive) {
                console.warn('Chrome not alive, restarting...');
                restartChrome();
            }
        })
        .catch(() => {
            console.error('Error checking Chrome status, restarting...');
            restartChrome();
        });
});