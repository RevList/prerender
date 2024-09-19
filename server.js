var prerender = require('./lib');
const redisCache = require('prerender-redis-cache');
const redis = require('redis');
const cron = require('node-cron');
const { spawn } = require('child_process');

const options = {
	pageDoneCheckInterval: 500,
	pageLoadTimeout: 40000, // Increased to 40 seconds
	waitAfterLastRequest: 250,
	jsTimeout: 40000, // Increased to 40 seconds
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
		'--disable-features=IsolateOrigins,site-per-process', // Disabling web security and origin isolation
	],
};
// console.log('Starting with options:', options);

const server = prerender(options);

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
const redisClient = redis.createClient({
	url: redisUrl,
	retry_strategy: function (options) {
		if (options.error && options.error.code === 'ECONNREFUSED') {
			return new Error('The server refused the connection');
		}
		if (options.total_retry_time > 1000 * 60 * 60) {
			return new Error('Retry time exhausted');
		}
		if (options.attempt > 10) {
			return undefined;
		}
		return Math.min(options.attempt * 100, 3000); // Retry logic for Redis connection
	},
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

// Start the Prerender server
server.start();

const restartChrome = () => {
	server.killChrome();
	server.spawnChrome();
};

// Cron job to restart Chrome instance every 5 minutes
cron.schedule('*/5 * * * *', () => {
	server.isChromeAlive()
		.then(isAlive => {
			if (!isAlive) {
				restartChrome(); // Restart Chrome if it's not alive
			}
		})
		.catch(() => {
			restartChrome(); // Restart Chrome if there are errors
		});
});