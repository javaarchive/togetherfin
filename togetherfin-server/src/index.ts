import { config as configDotenv } from 'dotenv';
configDotenv();

import { serve } from '@hono/node-server'
import { Hono } from 'hono'

const app = new Hono()

import frontend from "./frontend.js";
import api from "./api.js";
app.route("/api", api);
// for discord
app.route("/.proxy/api", api);
app.route("/", frontend);

app.get('/test', (c) => {
  return c.text('Hello Hono!')
})

const port = parseInt(process.env.PORT || "0") || 3000;;
console.log(`Server is running on http://localhost:${port}`)

const server = serve({
  fetch: app.fetch,
  port: port,
  hostname: process.env.HOSTNAME || "127.0.0.1"
});

import { realtime } from "./realtime.js";
realtime(server);