import { render } from '@testing-library/react';
import { LoadingSkeleton } from '../loading-skeleton';

describe('LoadingSkeleton', () => {
  it('renders card variant', () => {
    const { container } = render(<LoadingSkeleton variant="card" />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('renders table variant with default 5 rows', () => {
    const { container } = render(<LoadingSkeleton variant="table" />);
    const rows = container.querySelectorAll('[data-testid="skeleton-row"]');
    expect(rows).toHaveLength(5);
  });

  it('renders table variant with custom rows', () => {
    const { container } = render(<LoadingSkeleton variant="table" rows={3} />);
    const rows = container.querySelectorAll('[data-testid="skeleton-row"]');
    expect(rows).toHaveLength(3);
  });

  it('renders form variant', () => {
    const { container } = render(<LoadingSkeleton variant="form" />);
    expect(container.firstChild).toBeInTheDocument();
  });
});
