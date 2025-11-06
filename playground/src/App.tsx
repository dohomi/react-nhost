import { NhostProvider } from '../../src'

export function App() {
  return (
    <>
      <NhostProvider nhostClient={}>
        <h1>This is a test app.</h1>
      </NhostProvider>
    </>
  )
}
