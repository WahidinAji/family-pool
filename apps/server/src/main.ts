import { Effect } from 'effect'
import { startServer } from './server.js'

Effect.runPromise(startServer).catch((error) => {
  console.error('server failed to start', error)
  process.exit(1)
})
