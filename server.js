const prerender = require('prerender');
const redisCache = require('prerender-redis-cache');
const redis = require('redis');

const server = prerender({
  chromeLocation: '/usr/bin/google-chrome-stable',
  chromeFlags: [
    '--no-sandbox',
    '--headless',
    '--disable-gpu',
    '--remote-debugging-port=9222',
    '--hide-scrollbars',
    '--disable-software-rasterizer',
    '--disable-web-security',
    '--disable-features=IsolateOrigins,site-per-process' // Disabling web security and origin isolation
  ],
  logRequests: true,
  logErrors: true,
  pageLoadTimeout: 30000, // Increase timeout to 20 seconds
  waitAfterLastRequest: 5000, // Wait for 1 second after the last request
  port: process.env.PORT || 3000
});

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
const redisClient = redis.createClient({
  url: redisUrl
});

// Check Redis connection and clear cache on start
redisClient.on('connect', () => {
  console.log('Connected to Redis');
  // Clear the Redis cache on server start
  redisClient.flushdb((err, succeeded) => {
    if (err) {
      console.error('Failed to clear Redis cache:', err);
    } else {
      console.log('Redis cache cleared:', succeeded);
    }
  });
});

redisClient.on('error', (err) => {
  console.error('Redis connection error:', err);
});

server.use(redisCache);

server.use(prerender.sendPrerenderHeader());
server.use(prerender.blockResources());
server.use(prerender.removeScriptTags());
server.use(prerender.httpHeaders());
server.use(prerender.addMetaTags());

// Middleware to add a delay and check for meta tags
server.use({
  requestReceived: (req, res, next) => {
    console.log(`Request received: ${req.prerender.url}`);
    next();
  },
  pageLoaded: async (req, res, next) => {
    try {
      await req.prerender.page.waitForFunction(() => {
        return (
          document.querySelector('meta[property="og:title"]') &&
          document.querySelector('meta[property="og:description"]') &&
          document.querySelector('meta[property="og:image"]')
        );
      }, { timeout: 10000 });
      next();
    } catch (err) {
      console.error('Meta tags not found within 10 seconds:', err);
      next();
    }
  },
  pageDoneCheck: (req, res) => {
    const isPageDone = req.prerender.document.querySelector('meta[property="og:title"]') &&
                       req.prerender.document.querySelector('meta[property="og:description"]') &&
                       req.prerender.document.querySelector('meta[property="og:image"]');
    return isPageDone || req.prerender.document.readyState === 'complete';
  },
  beforeSend: (req, res, next) => {
    const title = req.prerender.document.querySelector('title') ? req.prerender.document.querySelector('title').textContent : 'No title found';
    console.log(`Page title: ${title}`);
    next();
  },
  failedRequest: (req, res, next) => {
    console.error(`Request failed: ${req.prerender.url}`);
    next();
  }
});

server.start();