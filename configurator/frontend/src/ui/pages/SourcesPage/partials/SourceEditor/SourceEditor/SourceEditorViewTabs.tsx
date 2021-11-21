import { Tabs } from "antd"
import cn from "classnames"
import { Prompt } from "react-router"
// @Components
import { SourceEditorFormConfiguration } from "./SourceEditorFormConfiguration"
import { SourceEditorFormStreams } from "./SourceEditorFormStreams"
import { SourceEditorFormConnections } from "./SourceEditorFormConnections"
import { SourceEditorViewTabsControls } from "./SourceEditorViewTabsControls"
import { SourceEditorViewTabsExtraControls } from "./SourceEditorViewTabsExtraControls"
import { SourceEditorDocumentationDrawer } from "./SourceEditorDocumentationDrawer"
// @Types
import { SourceConnector as CatalogSourceConnector } from "catalog/sources/types"
import { SourceEditorState, SetSourceEditorState } from "./SourceEditor"
import { TabName } from "ui/components/Tabs/TabName"

type SourceEditorTabsViewProps = {
  state: SourceEditorState
  controlsDisabled: boolean
  sourceId: string
  editorMode: "add" | "edit"
  showTabsErrors: boolean
  showDocumentationDrawer: boolean
  initialSourceData: Optional<Partial<SourceData>>
  sourceDataFromCatalog: CatalogSourceConnector
  configIsValidatedByStreams: boolean
  setSourceEditorState: SetSourceEditorState
  setControlsDisabled: ReactSetState<boolean>
  setTabsErrorsVisible: (value: boolean) => void
  setConfigIsValidatedByStreams: (value: boolean) => void
  setShowDocumentationDrawer: (value: boolean) => void
  handleBringSourceData: () => SourceData
  handleSave: AsyncUnknownFunction
  handleTestConnection: AsyncUnknownFunction
  handleLeaveEditor: VoidFunction
}

export const SourceEditorViewTabs: React.FC<SourceEditorTabsViewProps> = ({
  state,
  controlsDisabled,
  sourceId,
  editorMode,
  showTabsErrors,
  showDocumentationDrawer,
  initialSourceData,
  sourceDataFromCatalog,
  configIsValidatedByStreams,
  setSourceEditorState,
  setControlsDisabled,
  setTabsErrorsVisible,
  setConfigIsValidatedByStreams,
  setShowDocumentationDrawer,
  handleBringSourceData,
  handleSave,
  handleTestConnection,
  handleLeaveEditor,
}) => {
  return (
    <>
      <div className={cn("flex flex-col items-stretch flex-auto")}>
        <div className={cn("flex-grow")}>
          <Tabs
            type="card"
            defaultActiveKey="configuration"
            tabBarExtraContent={
              <SourceEditorViewTabsExtraControls
                sourceId={sourceId}
                sourceDataFromCatalog={sourceDataFromCatalog}
                showLogsButton={editorMode === "edit"}
                setDocumentationVisible={setShowDocumentationDrawer}
              />
            }
          >
            <Tabs.TabPane
              key="configuration"
              tab={
                <TabName
                  name="Configuration"
                  errorsCount={state.configuration.errorsCount}
                  hideErrorsCount={!showTabsErrors}
                />
              }
            >
              <SourceEditorFormConfiguration
                editorMode={editorMode}
                initialSourceData={initialSourceData}
                sourceDataFromCatalog={sourceDataFromCatalog}
                setSourceEditorState={setSourceEditorState}
                setControlsDisabled={setControlsDisabled}
                setTabErrorsVisible={setTabsErrorsVisible}
                setConfigIsValidatedByStreams={setConfigIsValidatedByStreams}
              />
            </Tabs.TabPane>
            <Tabs.TabPane
              key="streams"
              tab={<TabName name="Streams" errorsCount={state.streams.errorsCount} hideErrorsCount={!showTabsErrors} />}
            >
              <SourceEditorFormStreams
                initialSourceData={initialSourceData}
                sourceDataFromCatalog={sourceDataFromCatalog}
                sourceConfigValidatedByStreamsTab={configIsValidatedByStreams}
                setSourceEditorState={setSourceEditorState}
                setControlsDisabled={setControlsDisabled}
                setConfigIsValidatedByStreams={setConfigIsValidatedByStreams}
                handleBringSourceData={handleBringSourceData}
              />
            </Tabs.TabPane>
            <Tabs.TabPane
              key="connections"
              tab={
                <TabName
                  name="Connections"
                  errorsCount={state.connections.errorsCount}
                  hideErrorsCount={!showTabsErrors}
                />
              }
            >
              <SourceEditorFormConnections
                initialSourceData={initialSourceData}
                setSourceEditorState={setSourceEditorState}
              />
            </Tabs.TabPane>
          </Tabs>
        </div>

        <div className="flex-shrink border-t py-2">
          <SourceEditorViewTabsControls
            saveButton={{
              handleClick: handleSave,
            }}
            testConnectionButton={{
              handleClick: handleTestConnection,
            }}
            handleCancel={handleLeaveEditor}
            controlsDisabled={controlsDisabled}
          />
        </div>
      </div>

      <Prompt
        message={"You have unsaved changes. Are you sure you want to leave without saving?"}
        when={state.stateChanged}
      />

      {sourceDataFromCatalog?.documentation && (
        <SourceEditorDocumentationDrawer
          visible={showDocumentationDrawer}
          sourceDataFromCatalog={sourceDataFromCatalog}
          setVisible={setShowDocumentationDrawer}
        />
      )}
    </>
  )
}
