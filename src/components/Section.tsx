interface SectionProps {
  title: string;
  kicker?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}

export function Section({ title, kicker, action, children }: SectionProps) {
  return (
    <section className="section">
      <div className="section__header">
        <div>
          {kicker ? <span className="section__kicker">{kicker}</span> : null}
          <h2>{title}</h2>
        </div>
        {action ? <div className="section__action">{action}</div> : null}
      </div>
      {children}
    </section>
  );
}

