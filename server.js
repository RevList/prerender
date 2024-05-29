const prerender = require('prerender');

const server = prerender({
  chromeLocation: '/usr/bin/google-chrome-stable', // Specify the correct path to Chrome
  chromeFlags: ['--no-sandbox', '--headless', '--disable-gpu', '--remote-debugging-port=9222', '--hide-scrollbars'],
  port: process.env.PORT || 3000
});

server.use(prerender.sendPrerenderHeader());
server.use(prerender.blockResources());
server.use(prerender.removeScriptTags());
server.use(prerender.httpHeaders());
server.use(prerender.addMetaTags());

server.start();