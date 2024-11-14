import * as React from 'react';
import { useParams } from 'react-router-dom';
import { useTaskRuns } from '../../../../hooks/useTaskRuns';
import { HttpError } from '../../../../k8s/error';
import { RouterParams } from '../../../../routes/utils';
import ErrorEmptyState from '../../../../shared/components/empty-state/ErrorEmptyState';
import TaskRunListView from '../../../TaskRunListView/TaskRunListView';
import { useWorkspaceInfo } from '../../../Workspace/useWorkspaceInfo';

const PipelineRunTaskRunsTab: React.FC = () => {
  const { pipelineRunName } = useParams<RouterParams>();
  const { namespace } = useWorkspaceInfo();
  const [taskRuns, taskRunsLoaded, taskRunError] = useTaskRuns(namespace, pipelineRunName);
  if (taskRunError) {
    const httpError = HttpError.fromCode((taskRunError as { code: number }).code);
    return (
      <ErrorEmptyState
        httpError={httpError}
        title={`Unable to load pipeline run ${pipelineRunName}`}
        body={httpError.message}
      />
    );
  }

  return <TaskRunListView taskRuns={taskRuns} loaded={taskRunsLoaded} />;
};

export default PipelineRunTaskRunsTab;