module.exports = {
  apps: [{
    name: 'mudeunsa',
    script: './app.js',
    env: {
      NODE_ENV: 'production',
      PORT: 3002,
      BASE_PATH: '/stud2'
    }
  }]
};
