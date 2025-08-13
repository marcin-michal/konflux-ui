import * as React from 'react';
import { Button, Flex, FlexItem } from '@patternfly/react-core';
import { CompressIcon, DownloadIcon, ExpandIcon } from '@patternfly/react-icons/dist/esm/icons';
import classNames from 'classnames';
import { saveAs } from 'file-saver';
import { useK8sAndKarchResource } from '~/hooks/useK8sAndKarchResources';
import { PodModel } from '../../../../models/pod';
import { TaskRunKind } from '../../../../types';
import { WatchK8sResource } from '../../../../types/k8s';
import { useFullscreen } from '../../../hooks/fullscreen';
import ErrorEmptyState from '../../empty-state/ErrorEmptyState';
import { LoadingInline } from '../../status-box/StatusBox';
import { MultiStreamLogs } from './MultiStreamLogs';

type K8sAndKarchLogWrapperProps = {
  taskRun: TaskRunKind;
  downloadAllLabel?: string;
  onDownloadAll?: () => Promise<Error>;
  resource: WatchK8sResource;
};

const K8sAndKarchLogWrapper: React.FC<React.PropsWithChildren<K8sAndKarchLogWrapperProps>> = ({
  resource,
  taskRun,
  onDownloadAll,
  downloadAllLabel = 'Download all',
  ...props
}) => {
  const resourceRef = React.useRef(null);
  const resourceInit = React.useMemo(
    () => ({
      model: PodModel,
      queryOptions: {
        name: resource.name,
        ns: resource.namespace,
      },
    }),
    [resource.name, resource.namespace],
  );
  const queryOptions = React.useMemo(() => ({ retry: false }), []);

  const {
    data: obj,
    source,
    isLoading,
    fetchError,
  } = useK8sAndKarchResource(resourceInit, queryOptions, true);
  const [isFullscreen, fullscreenRef, fullscreenToggle] = useFullscreen<HTMLDivElement>();
  const [downloadAllStatus, setDownloadAllStatus] = React.useState(false);
  const currentLogGetterRef = React.useRef<() => string>();

  const taskName = taskRun?.spec.taskRef?.name ?? taskRun?.metadata.name;

  if (!isLoading && !fetchError && resource.name === obj.metadata.name) {
    resourceRef.current = obj;
  } else if (fetchError) {
    resourceRef.current = null;
  }

  const downloadLogs = () => {
    if (!currentLogGetterRef.current) return;
    const logString = currentLogGetterRef.current();
    const blob = new Blob([logString], {
      type: 'text/plain;charset=utf-8',
    });
    saveAs(blob, `${taskName}.log`);
  };

  const setLogGetter = React.useCallback((getter) => (currentLogGetterRef.current = getter), []);

  const startDownloadAll = () => {
    setDownloadAllStatus(true);
    onDownloadAll()
      .then(() => {
        setDownloadAllStatus(false);
      })
      .catch((err: Error) => {
        setDownloadAllStatus(false);
        // eslint-disable-next-line no-console
        console.warn(err.message || 'Error downloading logs.');
      });
  };

  if (isLoading) {
    <span
      className="multi-stream-logs__taskName__loading-indicator"
      data-testid="loading-indicator"
    >
      <LoadingInline />
    </span>;
  }

  if (fetchError) {
    return <ErrorEmptyState title="Error loading logs" body="Please try again later." />;
  }

  return (
    <div ref={fullscreenRef} className="multi-stream-logs">
      <Flex
        className={classNames({
          'multi-stream-logs--fullscreen': isFullscreen,
        })}
      >
        <FlexItem className="multi-stream-logs__button" align={{ default: 'alignRight' }}>
          <Button variant="link" onClick={downloadLogs} isInline>
            <DownloadIcon className="multi-stream-logs__icon" />
            Download
          </Button>
        </FlexItem>
        <FlexItem className="multi-stream-logs__divider">|</FlexItem>
        {onDownloadAll && (
          <>
            <FlexItem className="multi-stream-logs__button">
              <Button
                variant="link"
                onClick={startDownloadAll}
                isDisabled={downloadAllStatus}
                isInline
              >
                <DownloadIcon className="multi-stream-logs__icon" />
                {downloadAllLabel}
                {downloadAllStatus && <LoadingInline />}
              </Button>
            </FlexItem>
            <FlexItem className="multi-stream-logs__divider">|</FlexItem>
          </>
        )}
        {fullscreenToggle && (
          <FlexItem className="multi-stream-logs__button">
            <Button variant="link" onClick={fullscreenToggle} isInline>
              {isFullscreen ? (
                <>
                  <CompressIcon className="multi-stream-logs__icon" />
                  Collapse
                </>
              ) : (
                <>
                  <ExpandIcon className="multi-stream-logs__icon" />
                  Expand
                </>
              )}
            </Button>
          </FlexItem>
        )}
      </Flex>
      <MultiStreamLogs
        {...props}
        taskRun={taskRun}
        resourceName={resource?.name}
        resource={resourceRef.current}
        setCurrentLogsGetter={setLogGetter}
        source={source}
      />
    </div>
  );
};

export default K8sAndKarchLogWrapper;
