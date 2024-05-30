var prerender = require('./lib');
const redisCache = require('prerender-redis-cache');
const redis = require('redis');

const options = {
	pageDoneCheckInterval : 500,
	pageLoadTimeout: 20000,
	waitAfterLastRequest: 250,
	jsTimeout: 20000,
	iterations: 40,
	chromeFlags: [ 
		'--no-sandbox', 
		'--headless', 
		'--disable-gpu', 
		'--remote-debugging-port=9222', 
		'--disable-dev-shm-usage',
		'--hide-scrollbars',
		'--disable-software-rasterizer',
    	'--disable-web-security',
    	'--disable-features=IsolateOrigins,site-per-process' // Disabling web security and origin isolation 
	],
};
console.log('Starting with options:', options);

const server = prerender(options);

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
const redisClient = redis.createClient({
  url: redisUrl
});

// Check Redis connection and clear cache on start
redisClient.on('connect', () => {
  console.log('Connected to Redis');
  // Clear the Redis cache on server start
  redisClient.flushall((err, succeeded) => {
    if (succeeded) {
		console.log('Redis cache cleared:', succeeded);
    } else {
		console.error('Failed to clear Redis cache:', err);
    }
  });
});

redisClient.on('error', (err) => {
  console.error('Redis connection error:', err);
});

server.use(redisCache);

server.use(prerender.sendPrerenderHeader());
server.use(prerender.browserForceRestart());
server.use(prerender.removeScriptTags());
server.use(prerender.httpHeaders());
server.use(prerender.addMetaTags());

server.use({
	pageDoneCheck: (req, res) => {
		return req.prerender.documentReadyState === 'complete' && req.prerender.page.evaluate(() => window.prerenderReady);
	  }
  });

server.start();