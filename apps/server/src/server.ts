import { createHTTPServer } from '@trpc/server/adapters/standalone'
import { Effect } from 'effect'
import { createDb } from '@family-pool/db'
import { createContextFactory } from './context.js'
import { appRouter } from './routers/app.js'

function cors(req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) {
  res.setHeader('Access-Control-Allow-Origin', process.env.PUBLIC_APP_URL ?? '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'content-type')
  res.setHeader('Access-Control-Allow-Credentials', 'true')
}

export const startServer = Effect.sync(() => {
  const databasePath = process.env.DATABASE_PATH ?? '../../data/app.sqlite'
  const port = Number(process.env.PORT ?? 4000)

  const db = createDb(databasePath)
  const createContext = createContextFactory(db)

  const server = createHTTPServer({
    router: appRouter,
    createContext,
    middleware: (req, res, next) => {
      cors(req, res)
      if (req.method === 'OPTIONS') {
        res.writeHead(204)
        res.end()
        return
      }
      next()
    },
  })

  server.listen(port)
  return port
}).pipe(Effect.tap((port) => Effect.log(`server listening on :${port}`)))
