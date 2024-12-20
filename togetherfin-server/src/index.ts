import { serve } from '@hono/node-server'
import { Hono } from 'hono'

const app = new Hono()

import frontend from "./frontend.js";
app.route("/", frontend);

app.get('/test', (c) => {
  return c.text('Hello Hono!')
})

const port = 3000
console.log(`Server is running on http://localhost:${port}`)

serve({
  fetch: app.fetch,
  port
})
