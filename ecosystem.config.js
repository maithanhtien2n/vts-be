require('dotenv').config({ path: require('path').join(__dirname, '.env') });

module.exports = {
  apps: [
    {
      name: "vts-be",
      script: "./server.js",
      watch: false,
      env: {
        NODE_ENV: "production",
        MONGODB_URI: process.env.MONGODB_URI,
        PORT: process.env.PORT || 31526,
        GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
        GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
        GOOGLE_CALLBACK_URL: process.env.GOOGLE_CALLBACK_URL_PRO,
      },
    },
  ],
};

// pm2 restart ecosystem.config.js
