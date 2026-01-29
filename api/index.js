import app from '../app.js';

// Vercel expects to export a serverless function
export default async (req, res) => {
  // Forward the request to the Express app
  await app(req, res);
};
