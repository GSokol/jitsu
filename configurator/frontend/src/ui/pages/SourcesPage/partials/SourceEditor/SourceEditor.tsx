// @Libs
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Prompt, Redirect, useHistory, useParams } from 'react-router-dom';
import { Button, Collapse, Drawer, Form } from 'antd';
import { observer } from 'mobx-react-lite';
import cn from 'classnames';
import snakeCase from 'lodash/snakeCase';
// @Page
import { SourceEditorConfig } from './SourceEditorConfig';
import { SourceEditorStreams } from './SourceEditorStreams';
import { SourceEditorDestinations } from './SourceEditorDestinations';
// @Components
import { Tab, TabsConfigurator } from 'ui/components/Tabs/TabsConfigurator';
import { PageHeader } from 'ui/components/PageHeader/PageHeader';
import { EditorButtons } from 'ui/components/EditorButtons/EditorButtons';
// @Store
import { sourcesStore } from 'stores/sources';
// @Types
import {
  CommonSourcePageProps
} from 'ui/pages/SourcesPage/SourcesPage';
import { SourceConnector } from 'catalog/sources/types';
import { FormInstance } from 'antd/es';
import { withHome } from 'ui/components/Breadcrumbs/Breadcrumbs';
// @Routes
import { sourcesPageRoutes } from 'ui/pages/SourcesPage/SourcesPage.routes';
// @Catalog sources
import { allSources } from 'catalog/sources/lib';
// @Utils
import { sourcePageUtils } from 'ui/pages/SourcesPage/SourcePage.utils';
import { validateTabForm } from 'utils/forms/validateTabForm';
// @Hooks
import { useForceUpdate } from 'hooks/useForceUpdate';
// @Services
import { closeableMessage, handleError } from 'lib/components/components';
import { firstToLower } from 'lib/commons/utils';
// @Styles
import styles from './SourceEditor.module.less';
import QuestionCircleOutlined from '@ant-design/icons/lib/icons/QuestionCircleOutlined';
import { WithSourceEditorSyncContext } from './SourceEditorSyncContext';
import { SourceEditorStreamsAirbyteLoader } from './SourceEditorStreamsAirbyteLoader';

export type SourceTabKey = 'config' | 'streams' | 'destinations';

const SourceEditorComponent = ({
  setBreadcrumbs,
  editorMode
}: CommonSourcePageProps) => {
  const history = useHistory();

  const forceUpdate = useForceUpdate();

  const params =
    useParams<{ source?: string; sourceId?: string; tabName?: string }>();

  const [sourceSaving, setSourceSaving] = useState<boolean>(false);
  const [savePopover, switchSavePopover] = useState<boolean>(false);
  const [controlsDisabled, setControlsDisabled] = useState<boolean>(false);

  const [testConnecting, setTestConnecting] = useState<boolean>(false);
  const [testConnectingPopover, switchTestConnectingPopover] =
    useState<boolean>(false);

  const [activeTabKey, setActiveTabKey] = useState<SourceTabKey>('config');

  const [documentationVisible, setDocumentationVisible] = useState(false);

  const connectorSource = useMemo<SourceConnector>(() => {
    let sourceType = params.source
      ? params.source
      : params.sourceId
      ? sourcesStore.sources.find((src) => src.sourceId === params.sourceId)
          ?.sourceProtoType
      : undefined;

    return sourceType
      ? allSources.find(
          (source: SourceConnector) =>
            snakeCase(source.id) === snakeCase(sourceType)
        )
      : undefined;
  }, [params.source, params.sourceId]);

  const sourceData = useRef<SourceData>(
    sourcesStore.sources.find((src) => src.sourceId === params.sourceId) ??
      ({
        sourceId: sourcePageUtils.getSourceId(
          params.source,
          sourcesStore.sources.map((src) => src.sourceId)
        ),
        connected: false,
        sourceType: sourcePageUtils.getSourceType(connectorSource),
        sourceProtoType: snakeCase(params.source)
      } as SourceData)
  );

  const sourcesTabs = useRef<Tab<SourceTabKey>[]>([
    {
      key: 'config',
      name: 'Connection Properties',
      getComponent: (form: FormInstance) => (
        <SourceEditorConfig
          form={form}
          sourceReference={connectorSource}
          isCreateForm={editorMode === 'add'}
          initialValues={sourceData.current}
          sources={sourcesStore.sources}
          handleTouchAnyField={createTouchField(0)}
          disableFormControls={handleDisableFormControls}
          enableFormControls={handleEnableFormControls}
        />
      ),
      form: Form.useForm()[0],
      touched: false
    },
    {
      key: 'streams',
      name: 'Streams',
      getComponent: (form: FormInstance) =>
        connectorSource.protoType === 'airbyte' ? (
          <SourceEditorStreamsAirbyteLoader
            form={form}
            initialValues={sourceData.current}
            connectorSource={connectorSource}
            handleBringSourceData={handleBringSourceData}
          />
        ) : (
          <SourceEditorStreams
            form={form}
            initialValues={sourceData.current}
            connectorSource={connectorSource}
            handleTouchAnyField={createTouchField(1)}
          />
        ),
      form: Form.useForm()[0],
      isHidden: connectorSource?.protoType === 'singer',
      touched: false
    },
    {
      key: 'destinations',
      name: 'Linked Destinations',
      getComponent: (form: FormInstance) => (
        <SourceEditorDestinations
          form={form}
          initialValues={sourceData.current}
          handleTouchAnyField={createTouchField(2)}
        />
      ),
      form: Form.useForm()[0],
      errorsLevel: 'warning',
      touched: false
    }
  ]);

  const createTouchField = (index: number) => (value: boolean) => {
    const tab = sourcesTabs.current[index];

    tab.touched = value === undefined ? true : value;
  };

  const handleDisableFormControls = useCallback(() => {
    setControlsDisabled(true);
  }, []);

  const handleEnableFormControls = useCallback(() => {
    setControlsDisabled(false);
  }, []);

  const savePopoverClose = useCallback(() => switchSavePopover(false), []);
  const testConnectingPopoverClose = useCallback(
    () => switchTestConnectingPopover(false),
    []
  );

  const handleCancel = useCallback(
    () => history.push(sourcesPageRoutes.root),
    [history]
  );

  const handleBringSourceData = (): Promise<SourceData> => {
    return sourcePageUtils.bringSourceData({
      sourcesTabs: sourcesTabs.current,
      sourceData: sourceData.current,
      forceUpdate
    });
  };

  const handleTestConnection = () => {
    setTestConnecting(true);
    handleBringSourceData()
      .then(async (response: SourceData) => {
        sourceData.current = response;

        const testConnectionResults = await sourcePageUtils.testConnection(
          sourceData.current
        );

        sourceData.current = {
          ...sourceData.current,
          ...testConnectionResults
        };
      })
      .finally(() => {
        setTestConnecting(false);
      });
  };

  const handleSaveSource = () => {
    setSourceSaving(true);

    handleBringSourceData()
      .then(async (response: SourceData) => {
        sourceData.current = response;

        const testConnectionResults = await sourcePageUtils.testConnection(
          sourceData.current,
          true
        );

        sourceData.current = {
          ...sourceData.current,
          ...testConnectionResults
        };

        try {
          if (editorMode === 'add') sourcesStore.addSource(sourceData.current);
          if (editorMode === 'edit')
            sourcesStore.editSources(sourceData.current);

          sourcesTabs.current.forEach((tab: Tab) => (tab.touched = false));

          history.push(sourcesPageRoutes.root);

          if (sourceData.current.connected) {
            closeableMessage.success('New source has been added!');
          } else {
            closeableMessage.warn(
              `Source has been saved, but test has failed with '${firstToLower(
                sourceData.current.connectedErrorMessage
              )}'. Data from this source will not be available`
            );
          }
        } catch (error) {
          handleError(error, "Something goes wrong, source hasn't been added");
        }
      })
      .catch(() => {
        switchSavePopover(true);
      })
      .finally(() => {
        setSourceSaving(false);
      });
  };

  useEffect(() => {
    setBreadcrumbs(
      withHome({
        elements: [
          { title: 'Sources', link: sourcesPageRoutes.root },
          {
            title: (
              <PageHeader
                title={connectorSource?.displayName}
                icon={connectorSource?.pic}
                mode={editorMode}
              />
            )
          }
        ]
      })
    );
  }, [connectorSource, setBreadcrumbs]);

  if (!connectorSource) {
    return <Redirect to={sourcesPageRoutes.add} />;
  }

  return (
    <>
      <div className={cn('flex flex-col items-stretch flex-auto')}>
        <div className={cn('flex-grow')}>
          <WithSourceEditorSyncContext connectorSource={connectorSource}>
            <TabsConfigurator
              type="card"
              className={cn(styles.tabCard)}
              tabsList={sourcesTabs.current}
              activeTabKey={activeTabKey}
              onTabChange={setActiveTabKey}
              tabBarExtraContent={
                connectorSource?.documentation && (
                  <Button
                    type="link"
                    icon={<QuestionCircleOutlined />}
                    onClick={() => setDocumentationVisible(true)}
                  >
                    Documentation
                  </Button>
                )
              }
            />
          </WithSourceEditorSyncContext>
        </div>

        <div className="flex-shrink border-t pt-2">
          <EditorButtons
            save={{
              isRequestPending: sourceSaving,
              isPopoverVisible:
                savePopover &&
                sourcesTabs.current.some((tab: Tab) => tab.errorsCount > 0),
              handlePress: handleSaveSource,
              handlePopoverClose: savePopoverClose,
              titleText: 'Source editor errors',
              tabsList: sourcesTabs.current,
              disabled: controlsDisabled
            }}
            test={{
              isRequestPending: testConnecting,
              isPopoverVisible:
                testConnectingPopover && sourcesTabs.current[0].errorsCount > 0,
              handlePress: handleTestConnection,
              handlePopoverClose: testConnectingPopoverClose,
              titleText: 'Connection Properties errors',
              tabsList: [sourcesTabs.current[0]],
              disabled: controlsDisabled
            }}
            handleCancel={handleCancel}
          />
        </div>
      </div>

      <Prompt message={sourcePageUtils.getPromptMessage(sourcesTabs.current)} />

      {connectorSource?.documentation && (
        <Drawer
          title={<h2>{connectorSource.displayName} documentation</h2>}
          placement="right"
          closable={true}
          onClose={() => setDocumentationVisible(false)}
          width="70%"
          visible={documentationVisible}
        >
          <div className={styles.documentation}>
            <Collapse defaultActiveKey={['connection']} ghost>
              <Collapse.Panel
                header={
                  <div className="uppercase font-bold">
                    {connectorSource.displayName} overview
                  </div>
                }
                key="overview"
              >
                {connectorSource.documentation.overview}
              </Collapse.Panel>
              <Collapse.Panel
                header={
                  <div className="uppercase font-bold">How to connect</div>
                }
                key="connection"
              >
                {connectorSource.documentation.connection}
              </Collapse.Panel>
            </Collapse>
          </div>
        </Drawer>
      )}
    </>
  );
};

const SourceEditor = observer(SourceEditorComponent);

SourceEditor.displayName = 'SourceEditor';

export { SourceEditor };
