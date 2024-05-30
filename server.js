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
    // console.log(`Request received: ${req.prerender.url}`);
    next();
  },
  pageLoaded: async (req, res, next) => {
    try {
      console.log('Waiting for network to be idle...');
      await req.prerender.page.waitForNetworkIdle({ idleTime: 1000, timeout: 30000 });
      console.log('Network is idle.');

      const metaTags = await req.prerender.page.evaluate(() => {
        return {
          ogTitle: document.querySelector('meta[property="og:title"]')?.content || null,
          ogDescription: document.querySelector('meta[property="og:description"]')?.content || null,
          ogImage: document.querySelector('meta[property="og:image"]')?.content || null
        };
      });

      if (metaTags.ogTitle && metaTags.ogDescription && metaTags.ogImage) {
        console.log('Meta tags found:', metaTags);
      } else {
        console.error('Meta tags not fully found:', metaTags);
      }

      next();
    } catch (err) {
      console.error('Error waiting for network idle or checking meta tags:', err);
      next();
    }
  },
  pageDoneCheck: (req, res) => {
    if (!req.prerender.document) {
      console.error('Document is not defined.');
      return false;
    }
    const isPageDone = req.prerender.document.querySelector('meta[property="og:title"]') &&
                       req.prerender.document.querySelector('meta[property="og:description"]') &&
                       req.prerender.document.querySelector('meta[property="og:image"]');
    return isPageDone || req.prerender.document.readyState === 'complete';
  },
  beforeSend: (req, res, next) => {
    if (!req.prerender.document) {
      console.error('Document is not defined in beforeSend.');
      return next();
    }
    const title = req.prerender.document.querySelector('title') ? req.prerender.document.querySelector('title').textContent : 'No title found';
    console.log(`Page title: ${title}`);
    next();
  },
  failedRequest: (req, res, next) => {
    // console.error(`Request failed: ${req.prerender.url}`);
    next();
  }
});

server.start({
  server: {
    headers: {
      size: '5MB' // Increase header size limit to 2MB
    }
  }
});