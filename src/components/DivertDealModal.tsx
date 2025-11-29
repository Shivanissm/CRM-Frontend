import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import './DivertDealModal.css';
import { pipelinesApi } from '../services/pipelines';
import { dealsApi } from '../services/deals';
import { personsApi } from '../services/api';
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
      
      // Get identifiers from the current deal (priority: phone > instagramId > email)
      let phoneNumber: string | null = currentDeal.phoneNumber || null;
      let instagramId: string | null = null;
      let email: string | null = currentDeal.email || null;
      
      // If personId exists, get the person to get instagramId
      if (currentDeal.personId) {
        try {
          const person = await personsApi.get(currentDeal.personId);
          instagramId = person.instagramId || null;
          // If phoneNumber is not in deal, try to get it from person
          if (!phoneNumber) {
            phoneNumber = person.phone || null;
          }
          // If email is not in deal, try to get it from person
          if (!email) {
            email = person.email || null;
          }
        } catch (err) {
          console.warn('Failed to fetch person for deal:', err);
        }
      }
      
      // Use the new endpoint to get available pipelines (excludes pipelines where deal is already diverted)
      const availablePipelines = await dealsApi.getAvailablePipelines(dealId);
      
      // Get all deals (including deleted ones) to check for duplicates
      // We need to check all deals to see if any pipeline already has a deal with matching identifiers
      let allDeals: any[] = [];
      try {
        // Try to get all deals - if the API supports it
        // Otherwise, we'll need to check each pipeline individually
        allDeals = await dealsApi.list();
      } catch (err) {
        console.warn('Failed to fetch all deals, will check pipelines individually:', err);
      }
      
      // Filter out:
      // 1. The current pipeline (don't show self pipeline)
      // 2. The referenced pipeline (if this deal is already diverted, don't show the original pipeline)
      // 3. Pipelines that already contain a deal with matching phone/instagramId/email (including deleted deals)
      const filteredPipelines = availablePipelines.filter((p) => {
        if (p.id === currentPipelineId) return false;
        if (referencedPipelineId && p.id === referencedPipelineId) return false;
        
        // Check if this pipeline already has a deal with matching identifiers
        // Priority: phone > instagramId > email
        const pipelineDeals = allDeals.filter(deal => deal.pipelineId === p.id);
        
        for (const deal of pipelineDeals) {
          // Skip the current deal itself
          if (deal.id === dealId) continue;
          
          // Check phone number first (highest priority)
          if (phoneNumber && phoneNumber.trim()) {
            const dealPhone = deal.phoneNumber || null;
            if (dealPhone && dealPhone.trim() && dealPhone.trim() === phoneNumber.trim()) {
              return false; // Exclude this pipeline
            }
          }
          
          // Note: instagramId check will be done in the second pass below
          // to avoid too many API calls, we'll check it after filtering by phone/email first
          
          // Check email third (lowest priority, but check it if phone and instagramId are not available)
          if (email && email.trim() && (!phoneNumber || !phoneNumber.trim()) && (!instagramId || !instagramId.trim())) {
            const dealEmail = deal.email || null;
            if (dealEmail && dealEmail.trim() && dealEmail.trim().toLowerCase() === email.trim().toLowerCase()) {
              return false; // Exclude this pipeline
            }
          }
        }
        
        return true;
      });
      
      // For pipelines that passed the initial filter, we need to check instagramId more thoroughly
      // by fetching person data for deals that have personId
      const finalFilteredPipelines: Pipeline[] = [];
      
      for (const pipeline of filteredPipelines) {
        const pipelineDeals = allDeals.filter(deal => deal.pipelineId === pipeline.id && deal.id !== dealId);
        
        let hasMatchingDeal = false;
        
        // Check each deal in this pipeline
        for (const deal of pipelineDeals) {
          // Check phone number first
          if (phoneNumber && phoneNumber.trim()) {
            const dealPhone = deal.phoneNumber || null;
            if (dealPhone && dealPhone.trim() && dealPhone.trim() === phoneNumber.trim()) {
              hasMatchingDeal = true;
              break;
            }
          }
          
          // Check instagramId - need to get from person if personId exists
          // Only check if phone number didn't match (priority: phone > instagramId > email)
          if (!hasMatchingDeal && instagramId && instagramId.trim() && deal.personId) {
            try {
              const dealPerson = await personsApi.get(deal.personId);
              if (dealPerson.instagramId && dealPerson.instagramId.trim() && dealPerson.instagramId.trim() === instagramId.trim()) {
                hasMatchingDeal = true;
                break;
              }
            } catch (err) {
              // If we can't fetch the person, continue checking
              console.warn('Failed to fetch person for deal:', deal.id, err);
            }
          }
          
          // Check email only if phone and instagramId are not available (lowest priority)
          if (!hasMatchingDeal && email && email.trim() && (!phoneNumber || !phoneNumber.trim()) && (!instagramId || !instagramId.trim())) {
            const dealEmail = deal.email || null;
            if (dealEmail && dealEmail.trim() && dealEmail.trim().toLowerCase() === email.trim().toLowerCase()) {
              hasMatchingDeal = true;
              break;
            }
          }
        }
        
        if (!hasMatchingDeal) {
          finalFilteredPipelines.push(pipeline);
        }
      }
      
      // Load stages for each pipeline since we need them to find the diversion stage
      const pipelinesWithStages = await Promise.all(
        finalFilteredPipelines.map(async (pipeline) => {
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

