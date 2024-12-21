import { config as configDotenv } from 'dotenv';
configDotenv();

import { serve } from '@hono/node-server'
import { Hono } from 'hono'

const app = new Hono()

import frontend from "./frontend.js";
import api from "./api.js";
app.route("/api", api);
app.route("/", frontend);

app.get('/test', (c) => {
  return c.text('Hello Hono!')
})


const port = 3000
console.log(`Server is running on http://localhost:${port}`)

const server = serve({
  fetch: app.fetch,
  port
});

import { realtime } from "./realtime.js";
realtime(server);