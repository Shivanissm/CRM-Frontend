import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
}

export default function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <header className="hb-page-header">
      <div>
        <h1 className="hb-page-title">{title}</h1>
        {description && <p className="hb-page-subtitle">{description}</p>}
      </div>
      {actions && <div className="hb-page-actions">{actions}</div>}
    </header>
  );
}
