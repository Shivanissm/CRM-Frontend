import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import './DivertDealModal.css';
import { pipelinesApi } from '../services/pipelines';
import { dealsApi } from '../services/deals';
import type { Pipeline } from '../types/pipeline';
import type { DealStatus } from '../types/deal';

interface DivertDealModalProps {
  isOpen: boolean;
  onClose: () => void;
  dealId: number;
  currentPipelineId: number | null;
  onSuccess: () => void;
}

export default function DivertDealModal({
  isOpen,
  onClose,
  dealId,
  currentPipelineId,
  onSuccess,
}: DivertDealModalProps) {
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [selectedPipelineIds, setSelectedPipelineIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadPipelines();
      setSelectedPipelineIds([]);
      setError(null);
    }
  }, [isOpen]);

  const loadPipelines = async () => {
    setLoading(true);
    try {
      // Fetch the current deal to get referencedPipelineId (if it's a diverted deal)
      const currentDeal = await dealsApi.get(dealId);
      const referencedPipelineId = currentDeal.referencedPipelineId;
      
      // Use the new endpoint to get available pipelines (excludes pipelines where deal is already diverted)
      const availablePipelines = await dealsApi.getAvailablePipelines(dealId);
      
      // Filter out:
      // 1. The current pipeline (don't show self pipeline)
      // 2. The referenced pipeline (if this deal is already diverted, don't show the original pipeline)
      const filteredPipelines = availablePipelines.filter((p) => {
        if (p.id === currentPipelineId) return false;
        if (referencedPipelineId && p.id === referencedPipelineId) return false;
        return true;
      });
      
      // Load stages for each pipeline since we need them to find the diversion stage
      const pipelinesWithStages = await Promise.all(
        filteredPipelines.map(async (pipeline) => {
          try {
            const fullPipeline = await pipelinesApi.get(pipeline.id);
            return fullPipeline;
          } catch {
            // If we can't load stages, return the pipeline without stages
            return pipeline;
          }
        })
      );
      
      setPipelines(pipelinesWithStages);
    } catch (err: any) {
      console.error('Failed to load pipelines:', err);
      setError('Failed to load pipelines. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handlePipelineToggle = (pipelineId: number) => {
    setSelectedPipelineIds((prev) =>
      prev.includes(pipelineId)
        ? prev.filter((id) => id !== pipelineId)
        : [...prev, pipelineId]
    );
  };

  const findDiversionStage = (pipeline: Pipeline): number | null => {
    const diversionStage = pipeline.stages?.find(
      (stage) => stage.name.toLowerCase().includes('diversion')
    );
    return diversionStage?.id ?? null;
  };

  const handleSave = async (copy: boolean) => {
    if (selectedPipelineIds.length === 0) {
      setError('Please select at least one pipeline');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      // Get the current deal details
      const currentDeal = await dealsApi.get(dealId);

      // For each selected pipeline, find the diversion stage and create/update the deal
      const promises = selectedPipelineIds.map(async (pipelineId) => {
        const pipeline = pipelines.find((p) => p.id === pipelineId);
        if (!pipeline) return;

        const diversionStageId = findDiversionStage(pipeline);
        if (!diversionStageId) {
          throw new Error(`No diversion stage found in pipeline: ${pipeline.name}`);
        }

        // Create a new diverted deal in the selected pipeline
        // Use the new pipeline's organization, or fall back to current deal's organization if pipeline doesn't have one
        const newOrganizationId = pipeline.organization?.id ?? currentDeal.organizationId;
        
        const dealData = {
          name: currentDeal.name,
          value: currentDeal.value,
          organizationId: newOrganizationId,
          personId: currentDeal.personId,
          categoryId: currentDeal.categoryId,
          pipelineId: pipelineId,
          stageId: diversionStageId,
          status: 'IN_PROGRESS' as DealStatus, // Always set to IN_PROGRESS when diverting
          venue: currentDeal.venue,
          phoneNumber: currentDeal.phoneNumber,
          email: currentDeal.email,
          eventType: currentDeal.eventType,
          eventDate: currentDeal.eventDate,
          label: 'DIVERT',
          referencedDealId: dealId, // Link to the original deal
        };

        return dealsApi.create(dealData);
      });

      await Promise.all(promises);

      // If not copying, remove the deal from current pipeline
      if (!copy && currentPipelineId) {
        await dealsApi.remove(dealId);
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Failed to divert deal:', err);
      setError(err.response?.data?.message || err.message || 'Failed to divert deal. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  const modalContent = (
    <div className="divert-deal-overlay" onClick={onClose}>
      <div className="divert-deal-modal" onClick={(e) => e.stopPropagation()}>
        <div className="divert-deal-header">
          <h2>Divert Deal</h2>
          <button className="divert-deal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="divert-deal-content">
          <p className="divert-deal-description">
            Select one or more pipelines to divert this deal to. The deal will be moved to the diversion stage in the selected pipeline(s).
          </p>

          {loading ? (
            <div className="divert-deal-loading">Loading pipelines...</div>
          ) : error && !saving ? (
            <div className="divert-deal-error">{error}</div>
          ) : (
            <div className="divert-deal-pipelines">
              {pipelines.length === 0 ? (
                <div className="divert-deal-empty">No available pipelines</div>
              ) : (
                pipelines.map((pipeline) => (
                  <label key={pipeline.id} className="divert-deal-pipeline-item">
                    <input
                      type="checkbox"
                      checked={selectedPipelineIds.includes(pipeline.id)}
                      onChange={() => handlePipelineToggle(pipeline.id)}
                      disabled={saving}
                    />
                    <span className="divert-deal-pipeline-name">{pipeline.name}</span>
                    {!findDiversionStage(pipeline) && (
                      <span className="divert-deal-warning">(No diversion stage)</span>
                    )}
                  </label>
                ))
              )}
            </div>
          )}

          {error && saving && <div className="divert-deal-error">{error}</div>}
        </div>

        <div className="divert-deal-actions">
          <button
            type="button"
            className="divert-deal-btn-cancel"
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </button>
          <button
            type="button"
            className="divert-deal-btn-save"
            onClick={() => handleSave(false)}
            disabled={saving || selectedPipelineIds.length === 0}
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
          <button
            type="button"
            className="divert-deal-btn-save-copy"
            onClick={() => handleSave(true)}
            disabled={saving || selectedPipelineIds.length === 0}
          >
            {saving ? 'Saving...' : 'Save and Copy'}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}

