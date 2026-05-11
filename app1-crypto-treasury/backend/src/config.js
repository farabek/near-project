require('dotenv').config();

const config = {
  accountId: process.env.NEAR_ACCOUNT_ID,
  privateKey: process.env.NEAR_PRIVATE_KEY,
  contractId: process.env.NEAR_CONTRACT_ID,
  networkId: process.env.NEAR_NETWORK || 'testnet',
  nodeUrl: 'https://rpc.testnet.near.org',
  port: parseInt(process.env.PORT || '3000', 10),
  releaseApiKey: process.env.RELEASE_API_KEY,
};

function validateConfig() {
  const required = ['accountId', 'privateKey', 'contractId', 'releaseApiKey'];
  for (const key of required) {
    if (!config[key]) {
      throw new Error(`Missing required env var for: ${key}. Check your .env file.`);
    }
  }
}

module.exports = { config, validateConfig };
