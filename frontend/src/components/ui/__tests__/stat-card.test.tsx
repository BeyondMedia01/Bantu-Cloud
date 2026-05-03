import { render, screen } from '@testing-library/react';
import { StatCard } from '../stat-card';


describe('StatCard', () => {
  it('renders label and value', () => {
    render(<StatCard label="Total Employees" value={142} />);
    expect(screen.getByText('Total Employees')).toBeInTheDocument();
    expect(screen.getByText('142')).toBeInTheDocument();
  });

  it('renders trend text', () => {
    render(<StatCard label="Test" value={10} trend="+3 this month" />);
    expect(screen.getByText('+3 this month')).toBeInTheDocument();
  });

  it('applies green color for trendDirection=up', () => {
    render(<StatCard label="Test" value={10} trend="+3" trendDirection="up" />);
    expect(screen.getByText('+3')).toHaveClass('text-green-600');
  });

  it('applies red color for trendDirection=down', () => {
    render(<StatCard label="Test" value={10} trend="-2" trendDirection="down" />);
    expect(screen.getByText('-2')).toHaveClass('text-red-500');
  });

  it('applies neutral color by default', () => {
    render(<StatCard label="Test" value={10} trend="no change" />);
    expect(screen.getByText('no change')).toHaveClass('text-slate-500');
  });
});
