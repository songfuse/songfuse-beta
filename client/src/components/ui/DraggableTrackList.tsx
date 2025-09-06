import React from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import {
  restrictToVerticalAxis,
  restrictToParentElement,
} from '@dnd-kit/modifiers';

interface DraggableTrackListProps {
  children: React.ReactNode;
  tracks: any[];
  onReorder: (tracks: any[]) => void;
  disabled?: boolean;
  className?: string;
}

export function DraggableTrackList({
  children,
  tracks,
  onReorder,
  disabled = false,
  className = '',
}: DraggableTrackListProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;

    if (active.id !== over?.id) {
      // Use dragId if available, otherwise fall back to id
      const oldIndex = tracks.findIndex((track) => 
        (track.dragId || track.id) === active.id
      );
      const newIndex = tracks.findIndex((track) => 
        (track.dragId || track.id) === over?.id
      );

      const newTracks = arrayMove(tracks, oldIndex, newIndex);
      onReorder(newTracks);
    }
  }

  if (disabled) {
    return <div className={className}>{children}</div>;
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
      modifiers={[restrictToVerticalAxis, restrictToParentElement]}
    >
      <SortableContext
        items={tracks.map((track) => track.dragId || track.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className={className}>{children}</div>
      </SortableContext>
    </DndContext>
  );
}