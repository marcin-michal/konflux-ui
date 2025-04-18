import * as React from 'react';
import {
  Alert,
  AlertVariant,
  Button,
  ButtonVariant,
  Modal,
  ModalBoxBody,
  ModalBoxFooter,
  ModalBoxHeader,
  pluralize,
  Text,
  TextContent,
  TextVariants,
  Truncate,
} from '@patternfly/react-core';
import { Tbody, Thead, Th, Tr, Td, Table /* data-codemods */ } from '@patternfly/react-table';
import { useNamespace } from '~/shared/providers/Namespace';
import sendIconUrl from '../../assets/send.svg';
import successIconUrl from '../../assets/success.svg';
import { useApplicationPipelineGitHubApp } from '../../hooks/useApplicationPipelineGitHubApp';
import { PACState } from '../../hooks/usePACState';
import { ComponentModel } from '../../models';
import ExternalLink from '../../shared/components/links/ExternalLink';
import { ComponentKind } from '../../types';
import { useTrackEvent, TrackEvents } from '../../utils/analytics';
import { enablePAC, useComponentBuildStatus, getLastestImage } from '../../utils/component-utils';
import { useAccessReviewForModel } from '../../utils/rbac';
import AnalyticsButton from '../AnalyticsButton/AnalyticsButton';
import { ButtonWithAccessTooltip } from '../ButtonWithAccessTooltip';
import GitRepoLink from '../GitLink/GitRepoLink';
import { RawComponentProps } from '../modal/createModalLauncher';
import ComponentPACStateLabel from './ComponentPACStateLabel';

type Props = RawComponentProps & {
  components: ComponentKind[];
  singleComponent?: boolean;
};

const Row: React.FC<
  React.PropsWithChildren<{
    component: ComponentKind;
    onStateChange: (state: PACState) => void;
  }>
> = ({ component, onStateChange }) => {
  const namespace = useNamespace();
  const track = useTrackEvent();
  const { url: githubAppURL } = useApplicationPipelineGitHubApp();
  const [pacState, setPacState] = React.useState<PACState>(PACState.loading);
  const onComponentStateChange = React.useCallback(
    (state: PACState) => {
      setPacState(state);
      onStateChange(state);
    },
    [onStateChange],
  );
  const [canPatchComponent] = useAccessReviewForModel(ComponentModel, 'patch');
  const buildStatus = useComponentBuildStatus(component);
  const pacError = buildStatus?.pac?.['error-message'];
  const prURL = buildStatus?.pac?.['merge-url'];
  const latestImage = getLastestImage(component);

  React.useEffect(() => {
    onStateChange(pacState);
    // omit onStateChange because we only want to notify when state changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pacState]);

  return (
    <>
      <Tr
        data-test={`component-row ${component.metadata.name}`}
        style={
          pacState === PACState.error || pacState === PACState.sample ? { borderBottom: 0 } : {}
        }
      >
        <Td modifier="breakWord">
          <div>
            <b>{component.metadata.name}</b>
          </div>
          {component.spec.source?.git && (
            <div>
              Code repository:{' '}
              <GitRepoLink
                url={component.spec.source?.git?.url}
                revision={component.spec.source?.git?.revision}
                context={component.spec.source?.git?.context}
              />
            </div>
          )}
          {latestImage && (
            <div>
              Image:{' '}
              <ExternalLink
                href={latestImage.startsWith('http') ? latestImage : `https://${latestImage}`}
                text={<Truncate content={latestImage} />}
              />
            </div>
          )}
        </Td>

        <Td>
          <ComponentPACStateLabel onStateChange={onComponentStateChange} component={component} />
        </Td>
        <Td className="pf-v5-u-text-align-right">
          {(() => {
            switch (pacState) {
              case PACState.disabled:
              case PACState.error:
                return (
                  <ButtonWithAccessTooltip
                    onClick={() => {
                      void enablePAC(component).then(() => {
                        track('Enable PAC', {
                          component_name: component.metadata.name,
                          app_name: component.spec.application,
                          namespace,
                        });
                      });
                    }}
                    isDisabled={!canPatchComponent}
                    tooltip="You don't have access to send a pull request"
                    analytics={{
                      link_name: 'send-pull-request',
                      link_location: 'manage-builds-pipelines',
                      component_name: component.metadata.name,
                      app_name: component.spec.application,
                      namespace,
                    }}
                  >
                    Send pull request
                  </ButtonWithAccessTooltip>
                );
              case PACState.configureRequested:
              case PACState.unconfigureRequested:
                return (
                  <Button spinnerAriaValueText="Sending pull request" isLoading isDisabled>
                    {pacState === PACState.configureRequested
                      ? 'Sending pull request'
                      : 'Rolling back'}
                  </Button>
                );
              case PACState.pending:
                return (
                  <ExternalLink
                    variant={ButtonVariant.secondary}
                    href={prURL || component.spec.source?.git?.url}
                    analytics={{
                      link_name: 'merge-pull-request',
                      link_location: 'manage-builds-pipelines',
                      component_name: component.metadata.name,
                      app_name: component.spec.application,
                      git_url: component.spec.source?.git?.url,
                      url: prURL,
                      namespace,
                    }}
                  >
                    Merge in GitHub
                  </ExternalLink>
                );
              case PACState.ready:
                return (
                  <ExternalLink
                    variant={ButtonVariant.secondary}
                    href={component.spec.source?.git?.url}
                    analytics={{
                      link_name: 'edit-pipeline-in-github',
                      link_location: 'manage-builds-pipelines',
                      component_name: component.metadata.name,
                      app_name: component.spec.application,
                      git_url: component.spec.source?.git?.url,
                      namespace,
                    }}
                  >
                    Edit pipeline in GitHub
                  </ExternalLink>
                );
              case PACState.sample:
                return (
                  <ExternalLink
                    variant={ButtonVariant.secondary}
                    href={`${component.spec.source?.git?.url.replace(/\.git$/i, '')}/fork`}
                    analytics={{
                      link_name: 'fork-sample',
                      link_location: 'manage-builds-pipelines',
                      component_name: component.metadata.name,
                      app_name: component.spec.application,
                      git_url: component.spec.source?.git?.url,
                      namespace,
                    }}
                  >
                    Fork sample
                  </ExternalLink>
                );
              default:
                return null;
            }
          })()}
        </Td>
      </Tr>
      {pacState === PACState.sample ? (
        <Tr>
          <Td colSpan={4} style={{ paddingTop: 0 }}>
            <Alert isInline variant={AlertVariant.info} title="Samples cannot be upgraded">
              To upgrade to a custom build pipeline, fork your sample and create a new component
              first. Then we&apos;ll send a pull request to your repository containing the default
              build pipeline for you to customize.
            </Alert>
          </Td>
        </Tr>
      ) : null}
      {pacState === PACState.error ? (
        <Tr>
          <Td colSpan={4} style={{ paddingTop: 0 }}>
            <Alert
              isInline
              variant={AlertVariant.warning}
              title="Pull request failed to reach its destination"
              actionLinks={
                <>
                  <ExternalLink
                    href={githubAppURL}
                    analytics={{
                      link_name: 'install-github-app',
                      link_location: 'manage-builds-pipelines',
                      component_name: component.metadata.name,
                      app_name: component.spec.application,
                      namespace,
                    }}
                  >
                    Install GitHub Application
                  </ExternalLink>
                </>
              }
            >
              {pacError}
            </Alert>
          </Td>
        </Tr>
      ) : null}
    </>
  );
};

const CustomizePipeline: React.FC<React.PropsWithChildren<Props>> = ({
  components,
  onClose,
  singleComponent,
  modalProps,
}) => {
  const track = useTrackEvent();
  const namespace = useNamespace();
  const { url: githubAppURL } = useApplicationPipelineGitHubApp();
  const sortedComponents = React.useMemo(
    () => [...components].sort((a, b) => a.metadata.name.localeCompare(b.metadata.name)),
    [components],
  );

  const [componentState, setComponentState] = React.useState<{ [name: string]: PACState }>({});

  const completed = React.useMemo(
    () =>
      Object.values(componentState).every(
        (state) => state === PACState.ready || state === PACState.sample,
      ),
    [componentState],
  );

  const allLoading = React.useMemo(
    () => !Object.values(componentState).some((state) => state !== PACState.loading),
    [componentState],
  );

  const count = React.useMemo(
    () => Object.values(componentState).filter((state) => state === PACState.ready).length,
    [componentState],
  );

  const totalCount = React.useMemo(
    () => Object.values(componentState).filter((state) => state !== PACState.sample).length,
    [componentState],
  );

  const applicationName = components[0].spec.application;

  const trackedOnClose = React.useCallback(() => {
    track(TrackEvents.ButtonClicked, {
      link_name: 'manage-build-pipelines-close',
      app_name: applicationName,
      namespace,
    });
    onClose();
  }, [onClose, applicationName, namespace, track]);

  return (
    <Modal {...modalProps} onClose={trackedOnClose}>
      <ModalBoxHeader />
      <ModalBoxBody>
        <>
          <TextContent
            className="pf-v5-u-text-align-center pf-v5-u-pt-lg"
            style={{ visibility: allLoading ? 'hidden' : undefined }}
          >
            <Text component={TextVariants.p}>
              <img style={{ width: 100 }} src={completed ? successIconUrl : sendIconUrl} />
            </Text>
            <Text component={TextVariants.h2}>
              {singleComponent ? 'Edit build pipeline plan' : 'Manage build pipelines'}
            </Text>
            <Text component={TextVariants.p}>
              Add some automation by upgrading your default build pipelines to custom build
              pipelines. Custom build pipelines are pipelines as code, set on your component&apos;s
              repository. With custom build pipelines, commits to your main branch and pull requests
              will automatically rebuild. You can always roll back to default.
            </Text>
            <Text component={TextVariants.p}>
              Ready to use custom build pipelines? Make sure you have the GitHub application
              installed and grant permissions to your repositories.
            </Text>
            <Text component={TextVariants.p}>
              <ExternalLink
                href={githubAppURL}
                analytics={{
                  link_name: 'install-github-app',
                  link_location: 'manage-builds-pipelines',
                  namespace,
                }}
              >
                Install GitHub application
              </ExternalLink>
            </Text>
          </TextContent>
          <div className="pf-v5-u-mt-lg" />
          {alert}
          <Table>
            <Thead>
              <Tr>
                <Th>Component</Th>
                <Th modifier="fitContent">Build pipeline status</Th>
                <Th />
                <Th />
              </Tr>
            </Thead>
            <Tbody>
              {sortedComponents.map((component) => (
                <Row
                  key={component.metadata.name}
                  component={component}
                  onStateChange={(pacState) =>
                    setComponentState((prevState) => ({
                      ...prevState,
                      [component.metadata.name]: pacState,
                    }))
                  }
                />
              ))}
            </Tbody>
          </Table>
          {totalCount > 0 ? (
            <p
              className={`pf-v5-u-pt-lg ${
                count === totalCount ? 'pf-v5-u-success-color-100' : 'pf-v5-u-color-400'
              }`}
            >
              {`${count} of ${pluralize(totalCount, 'component')} upgraded to custom build`}
            </p>
          ) : undefined}
        </>
      </ModalBoxBody>
      <ModalBoxFooter>
        <AnalyticsButton
          variant={ButtonVariant.secondary}
          onClick={trackedOnClose}
          data-test="close-button custom-pipeline-modal"
        >
          Close
        </AnalyticsButton>
      </ModalBoxFooter>
    </Modal>
  );
};

export default CustomizePipeline;
