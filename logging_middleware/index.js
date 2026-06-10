const axios = require('axios');

const LOG_ENDPOINT =
  process.env.EVALUATION_LOG_URL ||
  'http://4.224.186.213/evaluation-service/logs';

async function Log(stack, level, pkg, message, token) {
  const accessToken = token || process.env.EVALUATION_ACCESS_TOKEN;

  if (!accessToken) {
    return;
  }

  try {
    await axios.post(
      LOG_ENDPOINT,
      { stack, level, package: pkg, message },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        timeout: 4000,
      }
    );
  } catch {
    // Logging must never break application behavior.
  }
}

module.exports = { Log };
