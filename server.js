const prerender = require('prerender');

const forwardHeaders = require('./plugins/forwardHeaders');
const removePrefetchTags = require('./plugins/removePrefetchTags');
const log = require('./plugins/log');

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
		'--hide-scrollbars',
		'--disable-software-rasterizer',
    	'--disable-web-security',
    	'--disable-features=IsolateOrigins,site-per-process' // Disabling web security and origin isolation 
	],
};
console.log('Starting with options:', options);

const server = prerender(options);

server.use(log);
server.use(forwardHeaders);
server.use(prerender.blockResources());
server.use(prerender.removeScriptTags());
server.use(removePrefetchTags);
// server.use(require('prerender-redis-cache'));
server.use(prerender.httpHeaders());
if (process.env.DEBUG_PAGES) {
	server.use(prerender.logger());
}

server.use({
	pageLoaded: async (req, res, next) => {
	  try {
		console.log('Waiting for `prerenderReady` flag...');
		await req.prerender.page.waitForFunction(() => {
		  return window.prerenderReady === true;
		}, { timeout: 30000 }); // 30 seconds timeout
  
		console.log('`prerenderReady` flag is set.');
		next();
	  } catch (err) {
		console.error('Error waiting for `prerenderReady` flag:', err);
		next();
	  }
	},
	pageDoneCheck: (req, res) => {
	  return req.prerender.documentReadyState === 'complete';
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
	  console.error(`Request failed: ${req.prerender.url}`);
	  next();
	}
  });

server.start();