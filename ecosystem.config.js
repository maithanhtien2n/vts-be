module.exports = {
  apps: [
    {
      name: "vts-be",
      script: "./server.js",
      watch: false,
      env: {
        NODE_ENV: "production",
        MONGODB_URI:
          "mongodb://admin:tn26052024@110.172.28.201:27017/vts-db?authSource=admin",
        PORT: 31526,
      },
      env_production: {
        NODE_ENV: "production",
        MONGODB_URI:
          "mongodb://admin:tn26052024@110.172.28.201:27017/vts-db?authSource=admin",
        PORT: 31526,
        GOOGLE_CLIENT_ID: env.GOOGLE_CLIENT_ID,
        GOOGLE_CLIENT_SECRET: env.GOOGLE_CLIENT_SECRET,
        GOOGLE_CALLBACK_URL: env.GOOGLE_CALLBACK_URL,

      },
    },
  ],
};
