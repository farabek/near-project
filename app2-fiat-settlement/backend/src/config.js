require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  app1Url: process.env.APP1_URL || 'http://localhost:3000',
  app1ApiKey: process.env.APP1_RELEASE_API_KEY || '',
  dbPath: process.env.DB_PATH || require('path').join(__dirname, '../../data/app2.db'),
};

function validateConfig() {
  if (!config.app1ApiKey) {
    throw new Error('APP1_RELEASE_API_KEY is required. Check your .env file.');
  }
}

module.exports = { config, validateConfig };
