import React from 'react';

interface MetricCardGridProps {
  children: React.ReactNode;
}

export const MetricCardGrid: React.FC<MetricCardGridProps> = ({ children }) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {children}
    </div>
  );
};
