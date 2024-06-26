var prerender = require('./lib');
const redisCache = require('prerender-redis-cache');
const redis = require('redis');
const cron = require('node-cron');
const { spawn } = require('child_process');

const options = {
	pageDoneCheckInterval : 500,
	pageLoadTimeout: 20000,
	waitAfterLastRequest: 250,
	jsTimeout: 20000,
	iterations: 20,
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
    	'--disable-features=IsolateOrigins,site-per-process' // Disabling web security and origin isolation 
	],
};
// console.log('Starting with options:', options);

const server = prerender(options);

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
const redisClient = redis.createClient({
  url: redisUrl
});

server.use(redisCache);

// Middleware to ignore specific URLs
server.use({
	requestReceived: (req, res, next) => {
	  const url = req.url.toLowerCase();
	  if (url.startsWith('/app/')) {
		// console.log(`Ignoring URL: ${req.url}`);
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

server.use({
	pageDoneCheck: (req, res) => {
		return req.prerender.documentReadyState === 'complete' && req.prerender.page.evaluate(() => window.prerenderReady);
	  }
  });

server.start();

cron.schedule('*/5 * * * *', () => {
	// console.log('Restarting server to refresh Chrome instance...');
	process.exit(0); // Exit the process to trigger a restart
});