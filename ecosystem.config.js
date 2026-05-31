module.exports = {
  apps: [
    {
      name: "vts-be",
      script: "./app.js",
      watch: false,
      env: {
        NODE_ENV: "production",
        MONGODB_URI:
          "mongodb://admin:tn26052024@110.172.28.201:27017/vts-db?authSource=admin",
        PORT: 31526,
      },
    },
  ],
};
