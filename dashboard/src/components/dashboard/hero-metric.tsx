"use client";

interface HeroMetricProps {
  value: number;
  label: string;
  subtitle: string;
  isLoading: boolean;
}

export function HeroMetric({ value, label, subtitle, isLoading }: HeroMetricProps): React.ReactElement {
  return (
    <div className="glass-card animate-fade-in-up rounded-xl p-8 text-center">
      {isLoading ? (
        <div className="flex flex-col items-center gap-3">
          <div className="h-16 w-48 animate-pulse rounded bg-muted" />
          <div className="h-5 w-32 animate-pulse rounded bg-muted" />
          <div className="h-4 w-64 animate-pulse rounded bg-muted" />
        </div>
      ) : (
        <>
          <p
            className="font-mono text-5xl font-bold text-primary sm:text-6xl lg:text-7xl"
            style={{ textShadow: "0 0 40px rgba(45, 212, 191, 0.3)" }}
          >
            {value.toLocaleString()}
          </p>
          <p className="mt-2 text-lg font-semibold tracking-wide">{label}</p>
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
        </>
      )}
    </div>
  );
}
