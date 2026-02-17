export const config = {
  port: parseInt(process.env.PORT || '3000'),
  corsOrigin: process.env.CORS_ORIGIN || '*',
  roomTimeout: 5 * 60 * 1000,
  defaultTurnTimeout: 30 * 1000,
};
