const serverless = require('serverless-http');
const { app, initDb } = require('../../server');

let isDbReady = false;

const serverlessHandler = serverless(app);

module.exports.handler = async (event, context) => {
  if (!isDbReady) {
    try {
      await initDb();
      isDbReady = true;
    } catch (err) {
      console.error('Netlify function initDb error:', err);
    }
  }
  return await serverlessHandler(event, context);
};
