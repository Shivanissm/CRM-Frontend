import { useState, useEffect } from 'react';
import type { Pipeline } from '../types/pipeline';
import './ReorderPipelinesModal.css';

const PIPELINE_ORDER_STORAGE_KEY = 'pipelineOrder';

interface ReorderPipelinesModalProps {
  isOpen: boolean;
  pipelines: Pipeline[];
  onClose: () => void;
  onSuccess: () => void;
}

export default function ReorderPipelinesModal({
  isOpen,
  pipelines: initialPipelines,
  onClose,
  onSuccess,
}: ReorderPipelinesModalProps) {
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      // Initialize with current pipeline order
      setPipelines([...initialPipelines]);
      setError(null);
    }
  }, [isOpen, initialPipelines]);

  if (!isOpen) return null;

  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex !== null && draggedIndex !== index) {
      setDragOverIndex(index);
    }
  };

  const handleDragLeave = () => {
    setDragOverIndex(null);
  };

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === dropIndex) {
      setDraggedIndex(null);
      setDragOverIndex(null);
      return;
    }

    const newPipelines = [...pipelines];
    const [draggedItem] = newPipelines.splice(draggedIndex, 1);
    newPipelines.splice(dropIndex, 0, draggedItem);

    setPipelines(newPipelines);
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleSave = () => {
    setIsSaving(true);
    setError(null);

    try {
      // Store the ordered pipeline IDs in localStorage
      const orderedPipelineIds = pipelines.map(p => p.id);
      localStorage.setItem(PIPELINE_ORDER_STORAGE_KEY, JSON.stringify(orderedPipelineIds));
      
      // Call onSuccess to notify parent component
      onSuccess();
      onClose();
    } catch (err: any) {
      const message = err?.message || 'Failed to save pipeline order.';
      setError(message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setPipelines([...initialPipelines]);
    setError(null);
    onClose();
  };

  return (
    <div className="reorder-pipelines-overlay" onClick={handleCancel}>
      <div className="reorder-pipelines-modal" onClick={(e) => e.stopPropagation()}>
        <div className="reorder-pipelines-header">
          <h2 className="reorder-pipelines-title">Reorder pipelines</h2>
          <button
            className="reorder-pipelines-close"
            onClick={handleCancel}
            type="button"
            aria-label="Close"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M15 5L5 15M5 5L15 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>

        <div className="reorder-pipelines-info">
          Changing the order of the pipelines will change the order for all users
        </div>

        {error && (
          <div className="reorder-pipelines-error">
            {error}
          </div>
        )}

        <div className="reorder-pipelines-list">
          {pipelines.map((pipeline, index) => (
            <div
              key={pipeline.id}
              className={`reorder-pipelines-item ${draggedIndex === index ? 'dragging' : ''} ${dragOverIndex === index ? 'drag-over' : ''}`}
              draggable
              onDragStart={() => handleDragStart(index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, index)}
              onDragEnd={handleDragEnd}
            >
              <div className="reorder-pipelines-item-content">
                <span className="reorder-pipelines-item-name">{pipeline.name}</span>
                <div className="reorder-pipelines-handle">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M3 6H13M3 10H13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="reorder-pipelines-actions">
          <button
            className="reorder-pipelines-cancel"
            onClick={handleCancel}
            type="button"
            disabled={isSaving}
          >
            Cancel
          </button>
          <button
            className="reorder-pipelines-save"
            onClick={handleSave}
            type="button"
            disabled={isSaving}
          >
            {isSaving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
