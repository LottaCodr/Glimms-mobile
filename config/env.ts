export const ENV = {
    API_URL: process.env.API_URL || 'https://glimms-backend.onrender.com/api/v1',
    API_TIMEOUT: Number(process.env.API_TIMEOUT) || 30000,
    API_RETRY: Number(process.env.API_RETRY) || 3,
};