import { useEffect, useMemo, useState } from 'react';
import StageModal from '../components/StageModal';
import PipelineModal from '../components/PipelineModal';
import { pipelinesApi } from '../services/pipelines';
import type { Pipeline, PipelineRequest, PipelineUpdateRequest, Stage, StageRequest } from '../types/pipeline';
import { organizationsApi } from '../services/organizations';
import { teamsApi } from '../services/teams';
import { dealsApi } from '../services/deals';
import type { Organization } from '../types/organization';
import type { Team } from '../types/team';
import type { Deal } from '../types/deal';
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
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [dealsLoading, setDealsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stageModal, setStageModal] = useState<StageModalState | null>(null);
  const [pipelineModal, setPipelineModal] = useState<PipelineModalState | null>(null);
  const [busyStageKey, setBusyStageKey] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [draggedDeal, setDraggedDeal] = useState<Deal | null>(null);
  const [dragOverStageId, setDragOverStageId] = useState<number | null>(null);
  
  // Filter states
  const [filterOrganization, setFilterOrganization] = useState<number | null>(null);
  const [filterCategory, setFilterCategory] = useState<string | null>(null);
  const [filterTeam, setFilterTeam] = useState<number | null>(null);
  const [selectedPipelineId, setSelectedPipelineId] = useState<number | null>(null);

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

  // Filter pipelines based on selected filters
  const filteredPipelines = useMemo(() => {
    return sortedPipelines.filter((pipeline) => {
      if (filterOrganization !== null && pipeline.organization?.id !== filterOrganization) {
        return false;
      }
      if (filterCategory !== null && pipeline.category !== filterCategory) {
        return false;
      }
      if (filterTeam !== null && pipeline.teamId !== filterTeam) {
        return false;
      }
      return true;
    });
  }, [sortedPipelines, filterOrganization, filterCategory, filterTeam]);

  // Get the selected pipeline or the first filtered pipeline
  const selectedPipeline = useMemo(() => {
    if (selectedPipelineId !== null) {
      return filteredPipelines.find((p) => p.id === selectedPipelineId) || null;
    }
    return filteredPipelines.length > 0 ? filteredPipelines[0] : null;
  }, [filteredPipelines, selectedPipelineId]);

  // Update selected pipeline when filters change
  useEffect(() => {
    if (selectedPipelineId === null || !filteredPipelines.find((p) => p.id === selectedPipelineId)) {
      setSelectedPipelineId(filteredPipelines.length > 0 ? filteredPipelines[0].id : null);
    }
  }, [filteredPipelines, selectedPipelineId]);

  // Filter deals for the selected pipeline
  const filteredDeals = useMemo(() => {
    if (!selectedPipeline) return [];
    
    return deals.filter((deal) => {
      // Only show deals that belong to this pipeline
      if (deal.pipelineId !== selectedPipeline.id) {
        return false;
      }
      
      // Only show IN_PROGRESS deals in the kanban
      if (deal.status !== 'IN_PROGRESS') {
        return false;
      }
      
      // Filter by organization if set
      if (filterOrganization !== null && deal.organizationId !== filterOrganization) {
        return false;
      }
      
      return true;
    });
  }, [deals, selectedPipeline, filterOrganization]);

  // Group deals by stage
  const dealsByStage = useMemo(() => {
    const grouped = new Map<number, Deal[]>();
    filteredDeals.forEach((deal) => {
      if (deal.stageId !== null && deal.stageId !== undefined) {
        const stageDeals = grouped.get(deal.stageId) || [];
        stageDeals.push(deal);
        grouped.set(deal.stageId, stageDeals);
      }
    });
    return grouped;
  }, [filteredDeals]);

  useEffect(() => {
    void loadPipelines();
    void loadOrganizations();
    void loadTeams();
    void loadDeals();
  }, []);

  // Reload deals when selected pipeline changes
  useEffect(() => {
    if (selectedPipelineId) {
      void loadDeals();
    }
  }, [selectedPipelineId]);

  const loadOrganizations = async () => {
    try {
      const data = await organizationsApi.list();
      setOrganizations(data);
    } catch (err: any) {
      console.error('Failed to load organizations:', err);
    }
  };

  const loadTeams = async () => {
    try {
      const data = await teamsApi.list();
      setTeams(data);
    } catch (err: any) {
      console.error('Failed to load teams:', err);
    }
  };

  const loadDeals = async () => {
    setDealsLoading(true);
    try {
      const data = await dealsApi.list();
      setDeals(data);
    } catch (err: any) {
      console.error('Failed to load deals:', err);
    } finally {
      setDealsLoading(false);
    }
  };

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
      // Also refresh deals
      await loadDeals();
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
    if (!window.confirm(`Delete stage "${stage.name}" from "${pipeline.name}"?`)) {
      return;
    }
    const hardDelete = window.confirm('Click "OK" for permanent delete, or "Cancel" for soft delete.');
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

  const handleDealDragStart = (e: React.DragEvent, deal: Deal) => {
    if (!selectedPipeline || selectedPipeline.isDeleted) {
      e.preventDefault();
      return;
    }
    setDraggedDeal(deal);
    e.dataTransfer.effectAllowed = 'move';
    if (e.dataTransfer) {
      e.dataTransfer.setData('text/plain', deal.id.toString());
    }
  };

  const handleDealDragEnd = () => {
    setDraggedDeal(null);
    setDragOverStageId(null);
  };

  const handleStageDragOver = (e: React.DragEvent, stageId: number, stage: Stage) => {
    e.preventDefault();
    e.stopPropagation();
    // Only allow drop on active stages
    if (stage.active && selectedPipeline && !selectedPipeline.isDeleted) {
      e.dataTransfer.dropEffect = 'move';
      setDragOverStageId(stageId);
    } else {
      e.dataTransfer.dropEffect = 'none';
    }
  };

  const handleStageDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Only clear if we're leaving the column itself, not a child element
    const target = e.currentTarget as HTMLElement;
    const relatedTarget = e.relatedTarget as HTMLElement;
    if (!target.contains(relatedTarget)) {
      setDragOverStageId(null);
    }
  };

  const handleStageDrop = async (e: React.DragEvent, targetStageId: number, stage: Stage) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverStageId(null);

    if (!draggedDeal || !selectedPipeline) {
      return;
    }

    // Don't allow drop on inactive stages or deleted pipelines
    if (!stage.active || selectedPipeline.isDeleted) {
      setDraggedDeal(null);
      return;
    }

    // Don't do anything if dropping on the same stage
    if (draggedDeal.stageId === targetStageId) {
      setDraggedDeal(null);
      return;
    }

    try {
      await dealsApi.moveToStage(draggedDeal.id, { stageId: targetStageId });
      // Refresh deals to show the updated state
      await loadDeals();
      setDraggedDeal(null);
    } catch (err: any) {
      const message = err?.response?.data?.message || err?.message || 'Failed to move deal.';
      setError(message);
      if (err?.response?.status === 401 || err?.response?.status === 403) {
        logoutAndRedirect();
      }
      setDraggedDeal(null);
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

      {/* Filters */}
      <div className="pipelines-filters">
        <select
          className="pipeline-filter-select"
          value={filterOrganization ?? ''}
          onChange={(e) => {
            setFilterOrganization(e.target.value ? Number(e.target.value) : null);
            setSelectedPipelineId(null);
          }}
        >
          <option value="">All Organizations</option>
          {organizations.map((org) => (
            <option key={org.id} value={org.id}>
              {org.name}
            </option>
          ))}
        </select>

        <select
          className="pipeline-filter-select"
          value={filterCategory ?? ''}
          onChange={(e) => {
            setFilterCategory(e.target.value || null);
            setSelectedPipelineId(null);
          }}
        >
          <option value="">All Categories</option>
          {categoryOptions.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>

        <select
          className="pipeline-filter-select"
          value={filterTeam ?? ''}
          onChange={(e) => {
            setFilterTeam(e.target.value ? Number(e.target.value) : null);
            setSelectedPipelineId(null);
          }}
        >
          <option value="">All Teams</option>
          {teams.map((team) => (
            <option key={team.id} value={team.id}>
              {team.name}
            </option>
          ))}
        </select>

        {filteredPipelines.length > 1 && (
          <select
            className="pipeline-filter-select"
            value={selectedPipelineId ?? ''}
            onChange={(e) => setSelectedPipelineId(e.target.value ? Number(e.target.value) : null)}
          >
            {filteredPipelines.map((pipeline) => (
              <option key={pipeline.id} value={pipeline.id}>
                {pipeline.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {loading ? (
        <div className="pipelines-loading">Loading pipelines…</div>
      ) : selectedPipeline ? (
        <div className="pipelines-kanban">
          <section className="pipeline-kanban-header">
            <div>
              <div className="pipeline-card-title">
                <h2>{selectedPipeline.name}</h2>
                {selectedPipeline.isDeleted && <span className="pipeline-badge muted">Archived</span>}
              </div>
              <div className="pipeline-card-meta">
                {selectedPipeline.category && <span>Category: {selectedPipeline.category}</span>}
                {selectedPipeline.team?.name && <span>Team: {selectedPipeline.team.name}</span>}
                {selectedPipeline.organization?.name && <span>Org: {selectedPipeline.organization.name}</span>}
              </div>
              <span className="pipeline-stage-count">
                {selectedPipeline.stages?.length ?? 0} stage{(selectedPipeline.stages?.length ?? 0) === 1 ? '' : 's'}
              </span>
            </div>
            <div className="pipeline-card-actions">
              <button
                className="pipeline-action"
                onClick={() => setStageModal({ mode: 'create', pipeline: selectedPipeline })}
                disabled={selectedPipeline.isDeleted}
              >
                + Stage
              </button>
              <button
                className="pipeline-action"
                onClick={() => setPipelineModal({ mode: 'edit', pipeline: selectedPipeline })}
              >
                Edit
              </button>
              <button
                className="pipeline-action"
                onClick={() => togglePipelineDeleted(selectedPipeline)}
              >
                {selectedPipeline.isDeleted ? 'Restore' : 'Archive'}
              </button>
              <button
                className="pipeline-action danger"
                onClick={() => void deletePipeline(selectedPipeline)}
              >
                Delete permanently
              </button>
            </div>
          </section>

          <div className="pipeline-kanban-board">
            {selectedPipeline.stages.length === 0 ? (
              <div className="pipeline-stage-empty">No stages yet. Add one to get started.</div>
            ) : (
              selectedPipeline.stages.map((stage, index) => {
                const stageKey = `${selectedPipeline.id}-${stage.id}`;
                const isBusy = busyStageKey?.startsWith(stageKey);
                return (
                  <div
                    key={stage.id}
                    className={`pipeline-kanban-column ${stage.active ? '' : 'inactive'} ${dragOverStageId === stage.id ? 'drag-over' : ''}`}
                    onDragOver={(e) => handleStageDragOver(e, stage.id, stage)}
                    onDragLeave={handleStageDragLeave}
                    onDrop={(e) => handleStageDrop(e, stage.id, stage)}
                  >
                    <div className="pipeline-kanban-column-header">
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
                          onClick={() => toggleStageActive(selectedPipeline, stage)}
                          disabled={isBusy || selectedPipeline.isDeleted}
                        >
                          {stage.active ? 'Deactivate' : 'Activate'}
                        </button>
                        <button
                          className="stage-action-button"
                          onClick={() => setStageModal({ mode: 'edit', pipeline: selectedPipeline, stage })}
                          disabled={isBusy || selectedPipeline.isDeleted}
                        >
                          Edit
                        </button>
                        <button
                          className="stage-action-button danger"
                          onClick={() => void deleteStage(selectedPipeline, stage)}
                          disabled={isBusy || selectedPipeline.isDeleted}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                    <div className="pipeline-kanban-column-content">
                      {dealsByStage.get(stage.id)?.map((deal) => (
                        <div
                          key={deal.id}
                          className={`pipeline-deal-card ${draggedDeal?.id === deal.id ? 'dragging' : ''}`}
                          draggable
                          onDragStart={(e) => handleDealDragStart(e, deal)}
                          onDragEnd={handleDealDragEnd}
                        >
                          <div className="pipeline-deal-name">{deal.name || `Deal #${deal.id}`}</div>
                          {deal.value && (
                            <div className="pipeline-deal-value">${deal.value.toLocaleString()}</div>
                          )}
                          {deal.organizationId && (
                            <div className="pipeline-deal-org">
                              {organizations.find((org) => org.id === deal.organizationId)?.name || `Org #${deal.organizationId}`}
                            </div>
                          )}
                        </div>
                      ))}
                      {(!dealsByStage.get(stage.id) || dealsByStage.get(stage.id)?.length === 0) && (
                        <div className="pipeline-deal-empty">No deals</div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      ) : (
        <div className="pipelines-loading">No pipelines match the selected filters.</div>
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

