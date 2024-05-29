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
    '--disable-software-rasterizer'
  ],
  logRequests: true,
  logErrors: true,
  port: process.env.PORT || 3000
});

const redisClient = redis.createClient({
  host: 'monorail.proxy.rlwy.net',
  port: 33416,
  password: 'fWJBdarXQJcyinfblQYTywbQOSeTbjzP'
});

server.use(redisCache({
  redisClient: redisClient,
  expire: 60 * 60 * 24 // Cache expiration time in seconds (24 hours)
}));

// Middleware to add a delay and check for meta tags
server.use({
  requestReceived: (req, res, next) => {
    console.log(`Request received: ${req.prerender.url}`);
    next();
  },
  pageLoaded: (req, res, next) => {
    setTimeout(() => {
      next();
    }, 5000); // Wait for 5 seconds
  },
  pageDoneCheck: (req, res) => {
    const isPageDone = req.prerender.document.querySelector('meta[property="og:title"]') &&
                       req.prerender.document.querySelector('meta[property="og:description"]') &&
                       req.prerender.document.querySelector('meta[property="og:image"]');
    return isPageDone;
  },
  failedRequest: (req, res, next) => {
    console.error(`Request failed: ${req.prerender.url}`);
    next();
  }
});

server.use(prerender.sendPrerenderHeader());
server.use(prerender.blockResources());
server.use(prerender.removeScriptTags());
server.use(prerender.httpHeaders());
server.use(prerender.addMetaTags());

server.start();