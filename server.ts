import express from 'express';
import app from './server/index.ts';

// Vercel detects Express from this root entry point and deploys the app as one function.
void express;
export default app;
