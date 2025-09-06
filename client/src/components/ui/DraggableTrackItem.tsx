import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DraggableTrackItemProps {
  id: string;
  children: React.ReactNode;
  disabled?: boolean;
  className?: string;
  showDragHandle?: boolean;
  dragHandleClassName?: string;
}

export function DraggableTrackItem({
  id,
  children,
  disabled = false,
  className = '',
  showDragHandle = true,
  dragHandleClassName = '',
}: DraggableTrackItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  if (disabled) {
    return (
      <div className={className} ref={setNodeRef}>
        {children}
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'relative group',
        isDragging && 'z-50 opacity-90 shadow-lg',
        className
      )}
    >
      {/* Drag handle */}
      {showDragHandle && (
        <div
          {...attributes}
          {...listeners}
          className={cn(
            'absolute left-1 top-1/2 -translate-y-1/2 z-10',
            'opacity-0 group-hover:opacity-100 transition-opacity',
            'cursor-grab active:cursor-grabbing',
            'text-muted-foreground hover:text-foreground',
            'p-1 rounded hover:bg-muted',
            dragHandleClassName
          )}
        >
          <GripVertical className="h-4 w-4" />
        </div>
      )}
      
      {/* Track content with left padding to make room for drag handle */}
      <div className={cn(showDragHandle && 'pl-8')}>
        {children}
      </div>
    </div>
  );
}