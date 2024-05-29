const prerender = require('prerender');

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

server.use(prerender.sendPrerenderHeader());
server.use(prerender.blockResources());
server.use(prerender.removeScriptTags());
server.use(prerender.httpHeaders());
server.use(prerender.addMetaTags());

server.on('pageLoaded', (req, res) => {
  console.log(`Page loaded: ${req.prerender.url}`);
});

server.on('failedRequest', (req, res) => {
  console.error(`Request failed: ${req.prerender.url}`);
});

server.start();