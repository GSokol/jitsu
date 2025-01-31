import React from "react"
import { CenteredSpin } from "lib/components/components"
import { Props } from "./CodeEditor.types"

const CodeEditorComponent = React.lazy(() => import("ui/components/CodeEditor/CodeEditorComponent"))

export const CodeEditor = (props: Props) => (
  <React.Suspense fallback={<CenteredSpin />}>
    <CodeEditorComponent {...props} />
  </React.Suspense>
)
