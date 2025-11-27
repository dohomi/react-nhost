import { NhostProvider } from '../../src'
import { createNhostClient } from "@nhost/nhost-js";
const nhostClient = createNhostClient({
  region: "us-west-1",
})
export function App() {
  return (
    <>
      <NhostProvider nhostClient={nhostClient}>
        <h1>This is a test app.</h1>
      </NhostProvider>
    </>
  )
}
