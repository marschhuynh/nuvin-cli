import React from 'react';
import { cn } from '@/lib/utils/index';

interface CollapsibleProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
  className?: string;
}

interface CollapsibleTriggerProps {
  asChild?: boolean;
  children: React.ReactNode;
  className?: string;
}

interface CollapsibleContentProps {
  children: React.ReactNode;
  className?: string;
}

const CollapsibleContext = React.createContext<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
} | null>(null);

export function Collapsible({ open, onOpenChange, children, className }: CollapsibleProps) {
  return (
    <CollapsibleContext.Provider value={{ open, onOpenChange }}>
      <div className={cn('', className)}>
        {children}
      </div>
    </CollapsibleContext.Provider>
  );
}

export function CollapsibleTrigger({ asChild, children, className }: CollapsibleTriggerProps) {
  const context = React.useContext(CollapsibleContext);
  
  if (!context) {
    throw new Error('CollapsibleTrigger must be used within a Collapsible');
  }

  const { open, onOpenChange } = context;

  const handleClick = () => {
    onOpenChange(!open);
  };

  if (asChild) {
    return React.cloneElement(children as React.ReactElement, {
      onClick: handleClick,
      className: cn((children as React.ReactElement).props.className, className),
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn('', className)}
    >
      {children}
    </button>
  );
}

export function CollapsibleContent({ children, className }: CollapsibleContentProps) {
  const context = React.useContext(CollapsibleContext);
  
  if (!context) {
    throw new Error('CollapsibleContent must be used within a Collapsible');
  }

  const { open } = context;

  if (!open) {
    return null;
  }

  return (
    <div className={cn('animate-in slide-in-from-top-1 duration-200', className)}>
      {children}
    </div>
  );
}