const prerender = require('prerender');
const redisCache = require('prerender-redis-cache');

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
  pageLoadTimeout: 20000, // Increase timeout to 20 seconds
  waitAfterLastRequest: 1000, // Wait for 1 second after the last request
  port: process.env.PORT || 3000
});

server.use(redisCache);

// Middleware to add a delay and check for meta tags
server.use({
  requestReceived: (req, res, next) => {
    // console.log(`Request received: ${req.prerender.url}`);
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
  beforeSend: (req, res, next) => {
    const title = req.prerender.document.querySelector('title').textContent;
    console.log(`Page title: ${title}`);
    next();
  },
  failedRequest: (req, res, next) => {
    // console.error(`Request failed: ${req.prerender.url}`);
    next();
  }
});

server.use(prerender.sendPrerenderHeader());
server.use(prerender.blockResources());
server.use(prerender.removeScriptTags());
server.use(prerender.httpHeaders());
server.use(prerender.addMetaTags());

server.start();