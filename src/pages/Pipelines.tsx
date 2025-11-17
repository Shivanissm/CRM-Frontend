import { useEffect, useMemo, useState } from 'react';
import StageModal from '../components/StageModal';
import PipelineModal from '../components/PipelineModal';
import { pipelinesApi } from '../services/pipelines';
import type { Pipeline, PipelineRequest, PipelineUpdateRequest, Stage, StageRequest } from '../types/pipeline';
import './Pipelines.css';
import { logoutAndRedirect } from '../utils/authToken';

type StageModalState =
  | { mode: 'create'; pipeline: Pipeline }
  | { mode: 'edit'; pipeline: Pipeline; stage: Stage };

type PipelineModalState =
  | { mode: 'create' }
  | { mode: 'edit'; pipeline: Pipeline };

export default function Pipelines() {
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stageModal, setStageModal] = useState<StageModalState | null>(null);
  const [pipelineModal, setPipelineModal] = useState<PipelineModalState | null>(null);
  const [busyStageKey, setBusyStageKey] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const sortedPipelines = useMemo(
    () =>
      pipelines.map((pipeline) => ({
        ...pipeline,
        stages: [...(pipeline.stages ?? [])].sort((a, b) => a.order - b.order),
      })),
    [pipelines],
  );

  const categoryOptions = useMemo(() => {
    const unique = new Set<string>();
    pipelines.forEach((pipeline) => {
      const category = pipeline.category?.trim();
      if (category) {
        unique.add(category);
      }
    });
    return Array.from(unique).sort((a, b) => a.localeCompare(b));
  }, [pipelines]);

  useEffect(() => {
    void loadPipelines();
  }, []);

  const loadPipelines = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await pipelinesApi.list({ includeStages: true });
      setPipelines(data);
    } catch (err: any) {
      const message = err?.response?.data?.message || err?.message || 'Failed to load pipelines.';
      setError(message);
      if (err?.response?.status === 401 || err?.response?.status === 403) {
        logoutAndRedirect();
      }
    } finally {
      setLoading(false);
    }
  };

  const refreshPipelines = async () => {
    setRefreshing(true);
    try {
      const data = await pipelinesApi.list({ includeStages: true });
      setPipelines(data);
      setError(null);
    } catch (err: any) {
      const message = err?.response?.data?.message || err?.message || 'Failed to refresh pipelines.';
      setError(message);
      if (err?.response?.status === 401 || err?.response?.status === 403) {
        logoutAndRedirect();
      }
    } finally {
      setRefreshing(false);
    }
  };

  const handlePipelineSubmit = async (values: PipelineRequest | PipelineUpdateRequest) => {
    if (!pipelineModal) return;
    if (pipelineModal.mode === 'create') {
      const createPayload: PipelineRequest = {
        name: values.name ?? '',
        category: values.category,
        teamId: values.teamId,
        organizationId: values.organizationId,
      };
      await pipelinesApi.create(createPayload);
    } else {
      const updatePayload: PipelineUpdateRequest = {
        name: values.name,
        category: values.category,
        teamId: values.teamId,
        organizationId: values.organizationId,
        deleted: (values as PipelineUpdateRequest).deleted,
      };
      await pipelinesApi.update(pipelineModal.pipeline.id, updatePayload);
    }
    await refreshPipelines();
  };

  const deletePipeline = async (pipeline: Pipeline) => {
    if (!window.confirm(`Delete pipeline “${pipeline.name}”?`)) return;
    const hardDelete = window.confirm('Click “OK” to permanently delete, or “Cancel” to archive.');
    try {
      await pipelinesApi.delete(pipeline.id, hardDelete ? true : undefined);
      await refreshPipelines();
    } catch (err: any) {
      const message = err?.response?.data?.message || err?.message || 'Failed to delete pipeline.';
      setError(message);
      if (err?.response?.status === 401 || err?.response?.status === 403) {
        logoutAndRedirect();
      }
    }
  };

  const togglePipelineDeleted = async (pipeline: Pipeline) => {
    const isArchived = pipeline.isDeleted ?? false;
    try {
      if (isArchived) {
        await pipelinesApi.update(pipeline.id, { deleted: false });
      } else {
        await pipelinesApi.archive(pipeline.id);
      }
      await refreshPipelines();
    } catch (err: any) {
      const message =
        err?.response?.data?.message || err?.message || 'Failed to update pipeline.';
      setError(message);
      if (err?.response?.status === 401) {
        logoutAndRedirect();
      }
    }
  };

  const handleStageModalSubmit = async (values: StageRequest & { active: boolean }) => {
    if (!stageModal) return;
    const { pipeline } = stageModal;
    if (stageModal.mode === 'create') {
      await pipelinesApi.createStage(pipeline.id, values);
    } else {
      await pipelinesApi.updateStage(pipeline.id, stageModal.stage.id, values);
    }
    await refreshPipelines();
  };

  const toggleStageActive = async (pipeline: Pipeline, stage: Stage) => {
    const key = `${pipeline.id}-${stage.id}-toggle`;
    setBusyStageKey(key);
    try {
      await pipelinesApi.updateStage(pipeline.id, stage.id, { active: !stage.active });
      await refreshPipelines();
    } catch (err: any) {
      const message = err?.response?.data?.message || err?.message || 'Failed to update stage.';
      setError(message);
      if (err?.response?.status === 401 || err?.response?.status === 403) {
        logoutAndRedirect();
      }
    } finally {
      setBusyStageKey(null);
    }
  };

  const moveStage = async (pipeline: Pipeline, stage: Stage, direction: -1 | 1) => {
    const stages = [...(pipeline.stages ?? [])].sort((a, b) => a.order - b.order);
    const index = stages.findIndex((s) => s.id === stage.id);
    const targetIndex = index + direction;
    if (index === -1 || targetIndex < 0 || targetIndex >= stages.length) return;
    const reordered = [...stages];
    const [removed] = reordered.splice(index, 1);
    reordered.splice(targetIndex, 0, removed);

    const key = `${pipeline.id}-${stage.id}-reorder`;
    setBusyStageKey(key);
    try {
      await pipelinesApi.reorderStages(pipeline.id, {
        orderedStageIds: reordered.map((s) => s.id),
      });
      await refreshPipelines();
    } catch (err: any) {
      const message = err?.response?.data?.message || err?.message || 'Failed to reorder stages.';
      setError(message);
      if (err?.response?.status === 401 || err?.response?.status === 403) {
        logoutAndRedirect();
      }
    } finally {
      setBusyStageKey(null);
    }
  };

  const deleteStage = async (pipeline: Pipeline, stage: Stage) => {
    if (!window.confirm(`Delete stage “${stage.name}” from “${pipeline.name}”?`)) {
      return;
    }
    const hardDelete = window.confirm('Click “OK” for permanent delete, or “Cancel” for soft delete.');
    const key = `${pipeline.id}-${stage.id}-delete`;
    setBusyStageKey(key);
    try {
      await pipelinesApi.deleteStage(pipeline.id, stage.id, hardDelete ? true : undefined);
      await refreshPipelines();
    } catch (err: any) {
      const message = err?.response?.data?.message || err?.message || 'Failed to delete stage.';
      setError(message);
      if (err?.response?.status === 401 || err?.response?.status === 403) {
        logoutAndRedirect();
      }
    } finally {
      setBusyStageKey(null);
    }
  };

  return (
    <div className="pipelines-page">
      <header className="pipelines-header">
        <div>
          <h1>Pipelines</h1>
          <p>Manage pipeline lifecycle, ownership, and stage workflows.</p>
        </div>
        <div className="pipelines-header-actions">
          <button className="pipelines-add" onClick={() => setPipelineModal({ mode: 'create' })}>
            + Pipeline
          </button>
          <button className="pipelines-refresh" onClick={() => void refreshPipelines()} disabled={refreshing}>
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </header>

      {error && <div className="pipelines-error">{error}</div>}

      {loading ? (
        <div className="pipelines-loading">Loading pipelines…</div>
      ) : (
        <div className="pipelines-grid">
          {sortedPipelines.map((pipeline) => (
            <section key={pipeline.id} className="pipeline-card">
              <div className="pipeline-card-header">
                <div>
                  <div className="pipeline-card-title">
                    <h2>{pipeline.name}</h2>
                    {pipeline.isDeleted && <span className="pipeline-badge muted">Archived</span>}
                  </div>
                  <div className="pipeline-card-meta">
                    {pipeline.category && <span>Category: {pipeline.category}</span>}
                    {pipeline.team?.name && <span>Team: {pipeline.team.name}</span>}
                    {pipeline.organization?.name && <span>Org: {pipeline.organization.name}</span>}
                  </div>
                  <span className="pipeline-stage-count">
                    {pipeline.stages?.length ?? 0} stage{(pipeline.stages?.length ?? 0) === 1 ? '' : 's'}
                  </span>
                </div>
                <div className="pipeline-card-actions">
                  <button
                    className="pipeline-action"
                    onClick={() => setStageModal({ mode: 'create', pipeline })}
                    disabled={pipeline.isDeleted}
                  >
                    + Stage
                  </button>
                  <button
                    className="pipeline-action"
                    onClick={() => setPipelineModal({ mode: 'edit', pipeline })}
                  >
                    Edit
                  </button>
                  <button
                    className="pipeline-action"
                    onClick={() => togglePipelineDeleted(pipeline)}
                  >
                    {pipeline.isDeleted ? 'Restore' : 'Archive'}
                  </button>
                  <button
                    className="pipeline-action danger"
                    onClick={() => void deletePipeline(pipeline)}
                  >
                    Delete permanently
                  </button>
                </div>
              </div>

              <ul className="pipeline-stage-list">
                {pipeline.stages.length === 0 && (
                  <li className="pipeline-stage-empty">No stages yet. Add one to get started.</li>
                )}
                {pipeline.stages.map((stage, index) => {
                  const stageKey = `${pipeline.id}-${stage.id}`;
                  const isBusy = busyStageKey?.startsWith(stageKey);
                  return (
                    <li key={stage.id} className={`pipeline-stage-item ${stage.active ? '' : 'inactive'}`}>
                      <div className="pipeline-stage-info">
                        <span className="pipeline-stage-name">{stage.name}</span>
                        <span className="pipeline-stage-order">Order #{stage.order}</span>
                        {typeof stage.probability === 'number' && (
                          <span className="pipeline-stage-probability">{stage.probability}% probability</span>
                        )}
                        {!stage.active && <span className="pipeline-stage-badge">Inactive</span>}
                      </div>
                      <div className="pipeline-stage-actions">
                        <button
                          className="stage-action-button"
                          onClick={() => moveStage(pipeline, stage, -1)}
                          disabled={isBusy || index === 0 || pipeline.isDeleted}
                          title="Move left"
                        >
                          ←
                        </button>
                        <button
                          className="stage-action-button"
                          onClick={() => moveStage(pipeline, stage, 1)}
                          disabled={isBusy || index === pipeline.stages.length - 1 || pipeline.isDeleted}
                          title="Move right"
                        >
                          →
                        </button>
                        <button
                          className="stage-action-button"
                          onClick={() => toggleStageActive(pipeline, stage)}
                          disabled={isBusy || pipeline.isDeleted}
                        >
                          {stage.active ? 'Deactivate' : 'Activate'}
                        </button>
                        <button
                          className="stage-action-button"
                          onClick={() => setStageModal({ mode: 'edit', pipeline, stage })}
                          disabled={isBusy || pipeline.isDeleted}
                        >
                          Edit
                        </button>
                        <button
                          className="stage-action-button danger"
                          onClick={() => void deleteStage(pipeline, stage)}
                          disabled={isBusy || pipeline.isDeleted}
                        >
                          Delete
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

      {stageModal && (
        <StageModal
          isOpen
          mode={stageModal.mode}
          pipelineName={stageModal.pipeline.name}
          stage={stageModal.mode === 'edit' ? stageModal.stage : undefined}
          onClose={() => setStageModal(null)}
          onSubmit={handleStageModalSubmit}
        />
      )}

      {pipelineModal && (
        <PipelineModal
          isOpen
          mode={pipelineModal.mode}
          pipeline={pipelineModal.mode === 'edit' ? pipelineModal.pipeline : undefined}
          onClose={() => setPipelineModal(null)}
          onSubmit={handlePipelineSubmit}
          categoryOptions={categoryOptions}
        />
      )}
    </div>
  );
}

